import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'SimAgents',
  tagline: 'A world where AI agents live, interact, and evolve',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: process.env.DOCS_URL ?? 'https://doc.simagents.io',
  baseUrl: process.env.DOCS_BASE_URL ?? '/',

  organizationName: 'reasance',
  projectName: 'simagents.io',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs/public', // Source from docs/public instead of docs-site/docs
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Docs at root
          editUrl: ({docPath}) => `https://github.com/reasance/simagents.io/edit/main/docs/public/${docPath}`,
        },
        blog: false, // Disable blog
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'SimAgents',
      logo: {
        alt: 'SimAgents Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/reasance/simagents.io',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'BYOK Security',
              href: 'https://github.com/reasance/simagents.io/blob/main/docs/security-byok.md',
            },
            {
              label: 'Research Guide',
              to: '/research-guide',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/reasance/simagents.io',
            },
            {
              label: 'Full PRD',
              href: 'https://github.com/reasance/simagents.io/blob/main/docs/PRD.md',
            },
            {
              label: 'Scientific Framework',
              href: 'https://github.com/reasance/simagents.io/blob/main/docs/appendix/scientific-framework.md',
            },
          ],
        },
        {
          title: 'Technical',
          items: [
            {
              label: 'Stack Rationale',
              href: 'https://github.com/reasance/simagents.io/blob/main/docs/appendix/stack-rationale.md',
            },
            {
              label: 'Roadmap',
              href: 'https://github.com/reasance/simagents.io/blob/main/ROADMAP.md',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AgentAuri. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
