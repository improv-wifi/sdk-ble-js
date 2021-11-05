import { TextFieldBase } from "@material/mwc-textfield/mwc-textfield-base";
import { styles } from "@material/mwc-textfield/mwc-textfield.css";

declare global {
  interface HTMLElementTagNameMap {
    "ib-textfield": IbTextfield;
  }
}

export class IbTextfield extends TextFieldBase {
  static override styles = [styles];
}

customElements.define("ib-textfield", IbTextfield);
