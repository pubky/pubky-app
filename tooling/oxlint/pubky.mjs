// Preserve the repository's selector-based runtime-config and test-cast restrictions.
// No imports: Oxlint supplies the parsed syntax tree and reporting API.
export default {
  meta: { name: 'pubky' },
  rules: {
    'no-restricted-syntax': {
      meta: {
        type: 'problem',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['selector', 'message'],
            additionalProperties: false,
          },
        },
      },
      create(context) {
        const listeners = {};
        for (const { selector, message } of context.options) {
          listeners[selector] = (node) => context.report({ node, message });
        }
        return listeners;
      },
    },
  },
};
