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

# 0.16.0
- Add support for new API keys (personal access tokens)

# 0.17.0
- Re-enable retries, which were disabled in 0.15.0. Failed requests now retry 3 times by default. Use `--max-retries 0` to disable retries.
- Retries apply to all requests to LogRocket (status check, release creation, and artifact uploads), not only to file uploads. Network errors also retry.
- `max-retries` and `max-retry-delay` are now global options. They work with all commands, and you can set them with the `LOGROCKET_MAX_RETRIES` and `LOGROCKET_MAX_RETRY_DELAY` environment variables.
- Note for `release --strict`: if a request fails but the server created the release, the retry gets a 409 and the command fails with "Release already exists". If you use `--strict` in a build script, make sure that the script can handle this failure, or use `--max-retries 0`.
