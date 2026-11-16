import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNative } from "./platform";

const TITLE = "Athlete Dashboard Export";

/** Hands the user a JSON file: share sheet in the app, share/download in the browser. */
export async function saveExportFile(fileName: string, json: string): Promise<void> {
  if (isNative) {
    // <a download> does nothing in WKWebView. Write a temp file and open the
    // share sheet ("In Dateien sichern", AirDrop, Mail).
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: TITLE, url: uri });
    } catch (err) {
      // Closing the sheet without choosing is not an error.
      if (!/cancel/i.test((err as Error).message)) throw err;
    } finally {
      // The file holds health data; do not leave it in the cache.
      await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {});
    }
    return;
  }

  const file = new File([json], fileName, { type: "application/json" });
  const download = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    // Revoking immediately can cancel the download in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  // The share sheet ("In Dateien sichern") is the reliable save path in an
  // installed iOS web app. Safari refuses share() once the tap that started the
  // export is "used up" by the slow loading before it (NotAllowedError); fall
  // back to a plain download then.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: TITLE });
    } catch (err) {
      if ((err as Error).name === "NotAllowedError") download();
      else if ((err as Error).name !== "AbortError") throw err;
    }
  } else {
    download();
  }
}
