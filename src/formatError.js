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
      console.error('Could not complete request.');
  }
  process.exit(1);
}
