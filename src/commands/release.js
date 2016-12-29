import apiClient from '../apiClient';
import formatError from '../formatError';

export const command = 'release <version>';
export const describe = 'Create a new release';
export const builder = (args) => {
  args
    .usage('\nUsage: logrocket release [--strict] <version>')
    .option('strict', {
      type: 'bool',
      describe: 'Fail on duplicate releases',
      default: false,
    })
    .demand(1, 'Missing release version: e.g. logrocket release 1.2.3')
    .help();
};

export const handler = async ({ version, strict, apikey, apihost, verbose }) => {
  console.info(`Creating release: ${version} ...`);

  const client = apiClient({ apikey, apihost });
  await client.checkStatus();

  const res = await client.createRelease({ version });

  if (strict && res.status === 409) {
    console.error('Release already exists. Choose a unique name or call without --strict.');
    process.exit(1);
  }

  if (!res.ok && res.status !== 409) {
    console.error(`Could not create release: ${version}`);
    await formatError(res, { verbose });
  }

  console.info('Success!');
};
