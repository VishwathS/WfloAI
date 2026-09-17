// Next 16 removed `next lint`, and eslint-config-next 16 ships flat config only,
// so the old .eslintrc.json could not carry over. This is the same rule set —
// next/core-web-vitals — expressed in the format both tools now require.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next 16 adds two React Compiler readiness rules that did not
// exist under 14: react-hooks/refs and react-hooks/set-state-in-effect. They
// fire only on code that predates this upgrade. Rewriting them here would mean
// changing canvas and hook behaviour to accommodate a framework bump, which
// task 06's Stop Conditions put out of scope — useBufferedField in particular
// is the subject of commit f356261 ("prevent stale and lost node field edits"),
// and its render-time ref writes are what that fix relies on.
//
// The rules stay on everywhere else, so no new code can add these patterns.
// Removing this block is tracked as follow-up work in release-readiness/06.
const preExistingReactCompilerDebt = {
  files: [
    "hooks/useBufferedField.ts",
    "components/canvas/ExecutionLog.tsx",
    "components/canvas/RunHistorySidebar.tsx",
    "components/canvas/WorkflowSettingsSidebar.tsx"
  ],
  rules: {
    "react-hooks/refs": "off",
    "react-hooks/set-state-in-effect": "off"
  }
};

const config = [
  {
    ignores: [".next/**", "node_modules/**", "temp-ecc/**", "next-env.d.ts"]
  },
  ...nextCoreWebVitals,
  preExistingReactCompilerDebt
];

export default config;
