import ResponseStatusMessage from './responseStatusMessage';

export default async function formatError(res, { verbose = false } = {}) {
  if (res.status < 300) {
    return;
  }

  console.error(
    new ResponseStatusMessage({
      code: res.status,
      text: res.statusText,
    }).toString()
  );

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
