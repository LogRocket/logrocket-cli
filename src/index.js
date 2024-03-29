import yargs from 'yargs';

process.on('unhandledRejection', (err) => {
  console.error(err.message);
  process.exit(1);
});

yargs // eslint-disable-line no-unused-expressions
  .usage('\nUsage: logrocket [-k <apikey>] <command> [<args>]')
  .env('LOGROCKET')
  .alias('h', 'help')
  .option('k', {
    alias: 'apikey',
    type: 'string',
    describe: 'Your LogRocket API key',
    demand: 'You must provide a LogRocket API key.',
    global: true,
    requiresArg: true,
  })
  .option('apihost', { // testing param to override api url
    type: 'string',
    describe: false,
  })
  .option('v', { // for debugging
    alias: 'verbose',
    boolean: true,
    describe: false,
  })
  .commandDir('commands')
  .help()
  .demand(1, 'Missing command, expected `release`, `upload`, or `upload-mobile`')
  .recommendCommands()
  .argv;
