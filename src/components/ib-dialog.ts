import { DialogBase } from "@material/mwc-dialog/mwc-dialog-base";
import { styles } from "@material/mwc-dialog/mwc-dialog.css";

declare global {
  interface HTMLElementTagNameMap {
    "ib-dialog": IbDialog;
  }
}

export class IbDialog extends DialogBase {
  static override styles = [styles];
}

customElements.define("ib-dialog", IbDialog);
