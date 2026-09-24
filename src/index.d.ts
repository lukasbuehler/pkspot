//declare module "googlemaps";

declare module "jszip/dist/jszip.min.js" {
  import JSZip from "jszip";

  export default JSZip;
}

declare module "qrcode/lib/browser.js" {
  export { create, toCanvas, toDataURL, toString } from "qrcode";
}
