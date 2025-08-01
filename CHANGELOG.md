# 0.13
- Adds support for `max-retries` and `max-retry-delay` options to upload command, to automatically retry failed sourcemap requests to LogRocket.

# 0.13.1
- Adds `duplex` option to fetch requests to address newer verisons of node requiring the setting on requests with a payload body.

# 0.14.0
- Adds `upload-mobile` command (with `platform` option to specify ios or android) for uploading dSYM file(s) for an iOS app or a mapping file for an android app

# 0.14.1
- Adds support for uploading React Native sourcemap files from the `upload` command

# 0.15.0
- Adds support for Node 18+ and removes support for versions prior to Node 10

# 0.15.1
- Update dependencies to address reported vulnerabilities

# 0.15.2
- Support artifact uploads for Expo-specific releases
