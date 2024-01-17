// import * as Antd from "antd";
import { themes } from "prism-react-renderer";
import React, { useState } from "react";
import { LiveEditor, LiveError, LivePreview, LiveProvider } from "react-live";
import * as components from "../index";

interface QueryPreviewProps {
  code: string;
}

export const QueryPreview = ({ code }: QueryPreviewProps) => {
  const [state, setState] = useState<{ code: string }>({ code: code.trim() });

  return (
    <>
      <LiveProvider
        code={`const query = ${state.code};\nrender(<>{query.toSQL(Q.flavors.mysql)}</>)`}
        scope={{
          ...components,
        }}
        noInline={true}
      >
        <div>
          <LiveEditor
            code={state.code}
            onChange={async (code) => setState({ code })}
            theme={themes.dracula}
          />
        </div>
        <div style={{ padding: 8, background: "#EEE", marginBottom: 16 }}>
          <LiveError />
          <LivePreview />
        </div>
      </LiveProvider>
    </>
  );
};
