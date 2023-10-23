export const uploadBuilderBuilder = versionSuffix => {
  const command = `upload${versionSuffix}`;
  const pathOption = `<path${versionSuffix === '-proguard' ? '' : 's..'}>`;
  return (args) => {
    args
      .usage(`\nUsage: logrocket ${command} -r <release> ${pathOption}`)
      .option('r', {
        alias: 'release',
        type: 'string',
        describe: 'The release version for these files',
        demand: 'You must specify a release, use -r or --release',
      })
      .option('p', {
        alias: 'urlPrefix',
        type: 'string',
        default: '~/',
        describe: 'Sets a URL prefix in front of all files. Defaults to "~/"',
      })
      .demand(1, `Missing upload path: e.g. logrocket ${command} -r 1.2.3 dist/`)
      .option('gcs-token', { // for testing, pass the webhook token to get an immediate pending=no
        type: 'string',
        describe: false,
      })
      .option('gcs-bucket', { // for testing, pass the webhook bucket to get an immediate pending=no
        type: 'string',
        describe: false,
      })
      .implies({
        'gcs-token': 'gcs-bucket',
        'gcs-bucket': 'gcs-token',
      })
      .option('max-retries', {
        type: 'number',
        describe: 'Failed upload retry limit (0 disables)',
        default: 0,
      })
      .option('max-retry-delay', {
        type: 'number',
        describe: 'Maximum delay between retries in ms',
        default: 30000,
      })
      .help('help');
  };
};
