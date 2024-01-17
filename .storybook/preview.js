/** @type { import('@storybook/react').Preview } */
const preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: (a, b) => {
        return (
          a.id.localeCompare(b.id, undefined, { numeric: true }) +
          (a.type === "docs" ? -10 : 0)
        );
      },
    },
  },
};

export default preview;
