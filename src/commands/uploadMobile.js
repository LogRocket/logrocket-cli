import { uploadMachO } from '../uploadMacho.js';
import { uploadProguard } from '../uploadProguard.js';

const PLATFORMS = {
  IOS: 'ios',
  ANDROID: 'android',
};

const PLATFORM_UPLOAD = {
  [PLATFORMS.IOS]: uploadMachO,
  [PLATFORMS.ANDROID]: uploadProguard,
};

export const command = 'upload-mobile <paths..>';
export const describe = 'Upload debug file(s) for a mobile release';

const sampleiOSUploadPath = '/build/MyApp-iphoneos.xcarchive/dSYMs/MyApp.framework.dSYM/Contents/Resources/';
const sampleAndroidUploadPath = '/app/build/outputs/mapping/debug/mapping.txt';
const usageStr = `Usage: logrocket upload-mobile -r <release> -p <platform> <paths..>
For android, include one path directly to debug file, like \`${sampleAndroidUploadPath}\`
See android dev docs for information on how to shrink and obfuscate your code https://developer.android.com/build/shrink-code#enable
`;
const demandPathStr = `Missing upload path, e.g.
logrocket upload-mobile -p ios -r 1.2.3 ${sampleiOSUploadPath}
-OR-
logrocket upload-mobile -p android -r 1.2.3 ${sampleAndroidUploadPath}
`;

export const builder = (args) => {
  args
    .usage(usageStr)
    .option('r', {
      alias: 'release',
      type: 'string',
      describe: 'The release version for these files',
      demand: 'You must specify a release, use -r or --release',
    })
    .demand(1, demandPathStr)
    .option('p', {
      alias: 'platform',
      choices: ['ios', 'android'],
      describe: 'The mobile platform of this file (or files)',
      demand: 'You must specify a platform (ios|android), use -p or --platform',
    })
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

export const handler = async (args) => {
  const { platform, ...rest } = args;
  PLATFORM_UPLOAD[platform](rest);
};
