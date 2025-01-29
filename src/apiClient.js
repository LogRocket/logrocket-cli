import nodeFetch from 'node-fetch';
import { version as cliVersion } from '../package.json';

if (!global.fetch) {
  global.fetch = module.exports;
  global.Response = nodeFetch.Response;
  global.Headers = nodeFetch.Headers;
  global.Request = nodeFetch.Request;
}

const delay = t => new Promise(resolve => setTimeout(resolve, t));

const RETRY_STATUS = [429, 500, 502, 503, 504];

async function retryableFetch(url, { maxRetries, maxRetryDelay, ...options }) {
  let result = await fetch(url, options);

  if (result.ok || !RETRY_STATUS.includes(result.status)) {
    return result;
  }

  for (let currentRetry = 0; currentRetry < maxRetries; currentRetry++) {
    const jitterMs = Math.round(Math.random() * 1000);
    const wait = Math.min(maxRetryDelay, Math.pow(2, currentRetry) * 1000) + jitterMs;
    await delay(wait);

    result = await fetch(url, options);

    if (result.ok || !RETRY_STATUS.includes(result.status)) {
      break;
    }
  }

  return result;
}

class ApiClient {
  constructor({
    apikey,
    apihost = 'https://api.logrocket.com',
  }) {
    this.apikey = apikey;
    this.apihost = apihost;
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
    const [orgSlug, appSlug] = this.apikey.split(':');

    return fetch(`${this.apihost}/v1/orgs/${orgSlug}/apps/${appSlug}/${url}/`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
      duplex: 'half',
    });
  }

  async checkStatus() {
    const res = await fetch(`${this.apihost}/cli/status/`, {
      headers: this.headers,
    });

    if (res.status === 204) {
      return;
    }

    let data;

    try {
      data = await res.json();
    } catch (err) {
      console.error('Could not verify CLI status. Check your network connection and reinstall the LogRocket CLI if the problem persists.');
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

  async uploadFile({
    contents, data, maxRetries, maxRetryDelay, url,
  }) {
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
      maxRetries,
      maxRetryDelay,
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
