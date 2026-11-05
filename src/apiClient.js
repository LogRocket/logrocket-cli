import './fetch';
import { version as cliVersion } from '../package.json';

const delay = t => new Promise(resolve => setTimeout(resolve, t));

const RETRY_STATUS = [429, 500, 502, 503, 504];

// A stream body can only be sent once; pass a function that returns a new stream per attempt.
async function retryableFetch(url, { maxRetries, maxRetryDelay, body, ...options }) {
  for (let attempt = 0; ; attempt++) {
    let result;
    let error;

    try {
      result = await fetch(url, { ...options, body: typeof body === 'function' ? body() : body });
    } catch (err) {
      error = err;
    }

    const retryable = error !== undefined || RETRY_STATUS.includes(result.status);
    if (!retryable || attempt >= maxRetries) {
      if (error !== undefined) {
        throw error;
      }
      return result;
    }

    const jitterMs = Math.round(Math.random() * 1000);
    await delay(Math.min(maxRetryDelay, Math.pow(2, attempt) * 1000) + jitterMs);
  }
}

class ApiClient {
  constructor({
    apikey,
    apihost = 'https://api.logrocket.com',
    maxRetries = 3,
    maxRetryDelay = 30000,
  }) {
    this.apikey = apikey;
    this.apihost = apihost;
    this.retry = { maxRetries, maxRetryDelay };
  }

  get headers() {
    return {
      Authorization: `Token ${this.apikey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-LogRocket-Cli-Version': cliVersion,
    };
  }

  async _makeRequest({ url, data }) {
    const parts = this.apikey.split(':');

    let orgSlug;
    let appSlug;
    if (parts.length === 4) {
      [, orgSlug, appSlug] = parts;
    } else if (parts.length === 3) {
      [orgSlug, appSlug] = parts;
    } else {
      throw new Error(
        'Invalid API key format: expected org:app:secret or pat:org:app:secret',
      );
    }

    return retryableFetch(`${this.apihost}/v1/orgs/${orgSlug}/apps/${appSlug}/${url}/`, {
      ...this.retry,
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
      duplex: 'half',
    });
  }

  async checkStatus() {
    const res = await retryableFetch(`${this.apihost}/cli/status/`, {
      ...this.retry,
      headers: this.headers,
    });

    if (res.status === 204) {
      return;
    }

    let data;

    try {
      data = await res.json();
    } catch (err) {
      console.error(`Could not verify CLI status (HTTP ${res.status}). Check your network connection and reinstall the LogRocket CLI if the problem persists.`);
      process.exit(1);
    }

    if (!res.ok) {
      console.error(data.message);
      process.exit(1);
    } else {
      console.info(data.message);
    }
  }

  async createRelease({ version }) {
    return this._makeRequest({
      url: 'releases',
      data: { version },
    });
  }

  async uploadFile({ contents, data, url }) {
    const res = await this._makeRequest({ url, data });
    if (!res.ok) {
      return res;
    }

    const fileData = await res.json();
    const gcloudUrl = fileData.signed_url;

    if (!gcloudUrl) {
      throw new Error(`Could not get upload url for: ${data.filepath}`);
    }

    const result = await retryableFetch(gcloudUrl, {
      ...this.retry,
      method: 'PUT',
      body: contents,
      duplex: 'half',
    });

    if (this._gcsBucket) {
      await fetch(`${this.apihost}/gcloud/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Channel-Token': this._gcsToken,
        },
        body: JSON.stringify({
          name: fileData.name,
          bucket: this._gcsBucket,
        }),
        duplex: 'half',
      });
    }

    return result;
  }

  setGCSData({ gcsToken, gcsBucket }) {
    this._gcsToken = gcsToken;
    this._gcsBucket = gcsBucket;
  }
}

export function apiClient(config) {
  return new ApiClient(config);
}
