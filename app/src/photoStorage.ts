import { Directory, File, Paths } from 'expo-file-system';
import { deleteOwnedPhotos, ownedNamesFromEntries, ownedPhotoName, parseLocalPhoto, type LocalPhoto } from './localPhotos';

const directory = new Directory(Paths.document, 'trustcam-photos-v1');
function ensureDirectory() { directory.create({ idempotent: true }); }
export function photoFile(name: string): File {
  if (!ownedPhotoName(name)) throw new Error('storage_error');
  return new File(directory, name);
}
export async function saveLocalPhoto(value: LocalPhoto): Promise<void> {
  const item = parseLocalPhoto(value);
  try {
    ensureDirectory();
    const suffix = item.evidence_id ? '.linked.json' : '.json';
    const destination = new File(directory, item.name + suffix);
    if (destination.exists) {
      const existing = parseLocalPhoto(JSON.parse(destination.textSync()));
      if (JSON.stringify(existing) !== JSON.stringify(item)) throw new Error('storage_error');
      return;
    }
    const temporary = new File(directory, item.name + suffix + '.tmp');
    temporary.create({ overwrite: true }); temporary.write(JSON.stringify(item));
    // Two immutable journal records: publish by same-directory rename, never iOS delete-before-overwrite.
    temporary.moveSync(destination);
  } catch { throw new Error('storage_error'); }
}
export function createLocalPhoto(name: string, source: File): File {
  try {
    ensureDirectory();
    const destination = photoFile(name);
    source.copySync(destination); // Preserve capture bytes, including failed/oversized upload candidates.
    return destination;
  } catch { throw new Error('storage_error'); }
}
export type OwnedPhoto = { name: string; legacy: boolean; metadata: LocalPhoto | null };
export function listLocalPhotos(): { photos: LocalPhoto[]; files: OwnedPhoto[]; corrupt: boolean } {
  try {
    ensureDirectory();
    const files: OwnedPhoto[] = [];
    let corrupt = false;
    for (const [folder, legacy] of [[directory, false], [Paths.document, true]] as const) {
      const entries = folder.list().filter(entry => entry instanceof File && entry.uri === new File(folder, entry.name).uri);
      const names = legacy ? entries.map(entry => entry.name).filter(ownedPhotoName) : ownedNamesFromEntries(entries.map(entry => entry.name));
      for (const name of names) {
        const entry = new File(folder, name);
        let metadata: LocalPhoto | null = null;
        if (!legacy) {
          for (const suffix of ['.linked.json', '.json']) {
            const sidecar = new File(directory, entry.name + suffix);
            if (!sidecar.exists) continue;
            try {
              metadata = parseLocalPhoto(JSON.parse(sidecar.textSync()));
              if (metadata.name !== entry.name) throw new Error();
              break;
            } catch { corrupt = true; metadata = null; }
          }
        }
        files.push({ name: entry.name, legacy, metadata });
      }
    }
    return { photos: files.flatMap(entry => entry.metadata ? [entry.metadata] : []), files, corrupt };
  } catch { throw new Error('storage_error'); }
}
export function ownedFile(entry: OwnedPhoto): File {
  if (!ownedPhotoName(entry.name)) throw new Error('storage_error');
  return entry.legacy ? new File(Paths.document, entry.name) : photoFile(entry.name);
}
export function deleteLocalPhotos(): number {
  const { files } = listLocalPhotos();
  const result = deleteOwnedPhotos(files, entry => {
    const image = ownedFile(entry);
    if (image.exists) image.delete(); // Never remove metadata if image deletion fails.
    if (!entry.legacy) {
      for (const suffix of ['.json', '.json.tmp', '.linked.json', '.linked.json.tmp']) {
        const metadata = new File(directory, entry.name + suffix);
        if (metadata.exists) metadata.delete();
      }
    }
  });
  return result.failed;
}
