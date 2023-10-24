export async function formatError(res, { verbose = false } = {}) {
  if (res.status < 300) {
    return;
  }

  console.error(`${res.status} ${res.statusText}`);

  const body = await res.text();

  if (verbose) {
    console.info(body);
  }

  try {
    const json = JSON.parse(body);

    if (json.error) {
      console.error(json.error);
    }
  } catch (err) {
    try {
      // retrieves GCS response body to clarify errors encountered when uploading files
      const resObj = JSON.parse(JSON.stringify(res));
      if (Array.isArray(resObj._raw)
        && resObj._raw.length > 0
        && resObj._raw[0].data
      ) {
        console.error(Buffer.from(resObj._raw[0].data));
      } else {
        console.error('Could not complete request.');
      }
    } catch (err) {
      console.error('Could not complete request.');
    }
  }

  process.exit(1);
}
