export default async function formatError(res) {
  if (res.status < 300) {
    return;
  }

  console.error(`${res.status} ${res.statusText}`);

  const body = await res.text();

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
