export async function formatError(res, { verbose = false } = {}) {
  if (res.status < 300) {
    return;
  }

  if (verbose) {
    console.error(`${res.status} ${res.statusText}`);

    const body = await res.text();
    console.info(body);
    try {
      const json = JSON.parse(body);

      if (json.error) {
        console.error(json.error);
      }
    } catch (err) {
      console.error('Could not complete request.');
    }
  } else {
    console.info('For additional details, rerun command with --verbose');
  }
  process.exit(1);
}
