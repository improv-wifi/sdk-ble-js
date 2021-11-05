import { CircularProgressBase } from "@material/mwc-circular-progress/mwc-circular-progress-base";
import { styles } from "@material/mwc-circular-progress/mwc-circular-progress.css";

declare global {
  interface HTMLElementTagNameMap {
    "ib-circular-progress": IbCircularProgress;
  }
}

export class IbCircularProgress extends CircularProgressBase {
  static override styles = [styles];
}

customElements.define("ib-circular-progress", IbCircularProgress);
