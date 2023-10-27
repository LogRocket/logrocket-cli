import { basename, join } from 'path';
import { cwd } from 'process';
import glob from 'glob';
import { statSync } from 'fs';

export async function gatherFiles(paths, { globString = '**/*.{js,jsx,js.map}' } = {}) {
  const map = [];

  await Promise.all(paths.map((path) => {
    const realPath = join(cwd(), path);

    if (statSync(realPath).isFile()) {
      map.push({
        path: realPath,
        name: basename(realPath),
      });

      return Promise.resolve();
    }

    return new Promise(resolve => {
      glob(globString, { cwd: realPath }, async (err, files) => {
        for (const file of files) {
          map.push({
            path: join(realPath, file),
            name: file,
          });
        }

        resolve();
      });
    });
  }));

  return map;
}
