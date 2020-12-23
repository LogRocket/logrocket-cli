import 'isomorphic-fetch';
import { version as cliVersion } from '../package.json';

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

  async uploadFile({ release, filepath, contents }) {
    const res = await this._makeRequest({
      url: `releases/${release}/artifacts`,
      data: { filepath },
    });

    if (!res.ok) {
      return res;
    }

    const fileData = await res.json();
    const gcloudUrl = fileData.signed_url;

    if (!gcloudUrl) {
      throw new Error(`Could not get upload url for: ${filepath}`);
    }

    const result = fetch(gcloudUrl, {
      method: 'PUT',
      body: contents,
    });

    if (this._gcsBucket) {
      await fetch(`${this.apihost}/gcloud/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Channel-Token': this._gcsToken,
        },
        body: JSON.stringify({
          name: fileData.name,
          bucket: this._gcsBucket,
        }),
      });
    }

    return result;
  }

  setGCSData({ gcsToken, gcsBucket }) {
    this._gcsToken = gcsToken;
    this._gcsBucket = gcsBucket;
  }
}

export default function apiClient(config) {
  return new ApiClient(config);
}
