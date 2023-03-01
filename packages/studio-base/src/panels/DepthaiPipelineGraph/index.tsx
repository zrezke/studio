// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import ReactDOM from "react-dom";

import { PanelExtensionContext } from "@foxglove/studio";
import Panel from "@foxglove/studio-base/components/Panel";
import { PanelExtensionAdapter } from "@foxglove/studio-base/components/PanelExtensionAdapter";
import DepthaiPipelineGraph from "@foxglove/studio-base/panels/DepthaiPipelineGraph/DepthaiPipelineGraph";
import { SaveConfig } from "@foxglove/studio-base/types/panels";

function initPanel(context: PanelExtensionContext) {
  ReactDOM.render(<DepthaiPipelineGraph context={context} />, context.panelElement);
  return () => {
    ReactDOM.unmountComponentAtNode(context.panelElement);
  };
}

type Props = {
  config: object;
  saveConfig: SaveConfig<object>;
};

function DepthaiPipelineGraphPanelAdapter(props: Props): JSX.Element {
  return (
    <PanelExtensionAdapter
      initPanel={initPanel}
      config={props.config}
      saveConfig={props.saveConfig}
    />
  );
}

DepthaiPipelineGraphPanelAdapter.panelType = "DepthaiPipelineGraph";
DepthaiPipelineGraphPanelAdapter.defaultConfig = {};

export default Panel(DepthaiPipelineGraphPanelAdapter);
