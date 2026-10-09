import { Button, InputNumber } from "antd";
import { useSignFill } from "./SignFillContext";
import {
  MARK_SIZE_MAX,
  MARK_SIZE_MIN,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
} from "./sizing";

/**
 * DefaultSizes: the size every new Text, Date, Check and Circle starts at, set
 * once for the whole document. "Apply to placed items" brings what's already on
 * the page to the same sizes.
 */
export function DefaultSizes() {
  const { defaults, setDefaults, applyDefaultsToAll, elements } = useSignFill();
  return (
    <div className="fb-field fb-sf-defaults-field">
      <label className="fb-field-label">Default sizes</label>
      <div className="fb-sf-defaults">
        <InputNumber
          size="small"
          addonBefore="Text"
          addonAfter="pt"
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          step={0.5}
          value={defaults.textSize}
          onChange={(v) => {
            if (v !== null) setDefaults({ textSize: v });
          }}
        />
        <InputNumber
          size="small"
          addonBefore="Check & circle"
          addonAfter="pt"
          min={MARK_SIZE_MIN}
          max={MARK_SIZE_MAX}
          step={0.5}
          value={defaults.markSize}
          onChange={(v) => {
            if (v !== null) setDefaults({ markSize: v });
          }}
        />
      </div>
      <Button size="small" onClick={applyDefaultsToAll} disabled={elements.length === 0}>
        Apply to placed items
      </Button>
    </div>
  );
}
