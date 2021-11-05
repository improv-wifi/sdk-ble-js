import { ButtonBase } from "@material/mwc-button/mwc-button-base";
import { styles } from "@material/mwc-button/styles.css";

declare global {
  interface HTMLElementTagNameMap {
    "ib-button": IbButton;
  }
}

export class IbButton extends ButtonBase {
  static override styles = [styles];
}

customElements.define("ib-button", IbButton);
