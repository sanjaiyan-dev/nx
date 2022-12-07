import { ExecutorContext, logger, runExecutor } from '@nrwl/devkit';
import ssrDevServerExecutor from '@nrwl/webpack/src/executors/ssr-dev-server/ssr-dev-server.impl';
import { WebSsrDevServerOptions } from '@nrwl/webpack/src/executors/ssr-dev-server/schema';
import { join } from 'path';
import * as chalk from 'chalk';
import {
  combineAsyncIterableIterators,
  tapAsyncIterable,
} from '@nrwl/devkit/src/utils/async-iterable';

type ModuleFederationDevServerOptions = WebSsrDevServerOptions & {
  devRemotes?: string | string[];
  skipRemotes?: string[];
  host: string;
};

export default async function* moduleFederationSsrDevServer(
  options: ModuleFederationDevServerOptions,
  context: ExecutorContext
) {
  let iter = ssrDevServerExecutor(options, context);
  const p = context.workspace.projects[context.projectName];

  const moduleFederationConfigPath = join(
    context.root,
    p.root,
    'module-federation.config.js'
  );

  let moduleFederationConfig: any;
  try {
    moduleFederationConfig = require(moduleFederationConfigPath);
  } catch {
    // TODO(jack): Add a link to guide
    throw new Error(
      `Could not load ${moduleFederationConfigPath}. Was this project generated with "@nrwl/react:host"?`
    );
  }

  const remotesToSkip = new Set(options.skipRemotes ?? []);
  const knownRemotes = (moduleFederationConfig.remotes ?? []).filter(
    (r) => !remotesToSkip.has(r)
  );

  const devServeApps = !options.devRemotes
    ? []
    : Array.isArray(options.devRemotes)
    ? options.devRemotes
    : [options.devRemotes];

  for (const app of knownRemotes) {
    const [appName] = Array.isArray(app) ? app : [app];
    const isDev = devServeApps.includes(appName);
    iter = combineAsyncIterableIterators(
      iter,
      await runExecutor(
        {
          project: appName,
          target: isDev ? 'serve' : 'serve-server',
          configuration: context.configurationName,
        },
        {
          watch: isDev,
        },
        context
      )
    );
  }

  let numAwaiting = knownRemotes.length + 1; // remotes + host
  return yield* tapAsyncIterable(iter, (x) => {
    numAwaiting--;
    if (numAwaiting === 0) {
      logger.info(
        `[ ${chalk.green('ready')} ] http://${options.host ?? 'localhost'}:${
          options.port ?? 4200
        }`
      );
    }
  });
}