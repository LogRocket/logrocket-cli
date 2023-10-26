import { basename, join } from 'path';
import { cwd } from 'process';
import glob from 'glob';
import { statSync } from 'fs';

function getFilesRecursively(path, {
  globString = '**/*.{js,jsx,js.map}',
  map,
  realPaths,
  workingDirectory = cwd(),
} = {}) {
  const fullPath = join(workingDirectory, path);
  if (statSync(fullPath).isFile()) {
    if (!realPaths.has(fullPath)) {
      map.push({
        path: fullPath,
        name: basename(fullPath),
      });
      realPaths.add(fullPath);
    }
  } else {
    try {
      glob(globString, { cwd: fullPath, sync: true }).forEach(file =>
        getFilesRecursively(file, {
          globString,
          map,
          realPaths,
          workingDirectory: fullPath,
        })
      );
    } catch (e) {
      console.error(e);
    }
  }
}

export async function gatherFiles(paths, {
  globString = '**/*.{js,jsx,js.map}',
} = {}) {
  const map = [];
  const realPaths = new Set();

  await Promise.all(paths.map(path => {
    return new Promise(resolve => {
      getFilesRecursively(path, {
        globString,
        map,
        realPaths,
      });
      resolve();
    });
  }));

  return map;
}
