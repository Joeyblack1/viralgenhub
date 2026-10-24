import { Agent, buildConnector } from 'undici';
import axios, { AxiosInstance } from 'axios';
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { isBlockedIp } from './webhook.url.validator';

// Pins DNS resolution: every resolved IP is checked with `isBlockedIp` and
// the caller connects to that same set. Closes the TOCTOU window
// `isSafePublicHttpsUrl` alone leaves open (see GHSA-f7jj-p389-4w45).
function ssrfSafeLookup(
  hostname: string,
  options: any,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: any,
    family?: number
  ) => void
) {
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname);
    if (isBlockedIp(hostname)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    return options && (options as any).all
      ? callback(null, [{ address: hostname, family }] as any, family)
      : callback(null, hostname, family);
  }

  dns.lookup(hostname, options, (err, address: any, family: any) => {
    if (err) return callback(err, '', 0);
    if (Array.isArray(address)) {
      for (const entry of address) {
        if (isBlockedIp(entry.address)) {
          return callback(new Error('Blocked IP'), '', 0);
        }
      }
      return callback(null, address as any, 0);
    }
    if (isBlockedIp(address)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    callback(null, address, family);
  });
}

// Node connects to an IP-literal host without calling `lookup`, so on its own
// the hook above never sees `http://169.254.169.254` or `http://[::1]`. Two
// more checks close that: the literal is judged before connecting, and the
// socket's peer address once connected, whichever way the host was spelled
// (a hex IPv4-mapped IPv6 included) and whatever a redirect pointed at.
function isBlockedLiteral(host: unknown): boolean {
  const hostname = String(host || '').replace(/^\[|\]$/g, '');
  return !!net.isIP(hostname) && isBlockedIp(hostname);
}

function isBlockedPeer(socket: net.Socket): boolean {
  return isBlockedIp(socket.remoteAddress || '');
}

const pinnedConnector = buildConnector({ lookup: ssrfSafeLookup } as any);

const ssrfSafeConnect: buildConnector.connector = (options, callback) => {
  if (isBlockedLiteral(options.hostname)) {
    return callback(new Error('Blocked IP'), null);
  }

  pinnedConnector(options, (err, socket) => {
    if (err) {
      return callback(err, null);
    }
    if (isBlockedPeer(socket)) {
      socket.destroy();
      return callback(new Error('Blocked IP'), null);
    }
    callback(null, socket);
  });
};

export const ssrfSafeDispatcher = new Agent({
  connect: ssrfSafeConnect,
});

// axios can't use an undici dispatcher, but Node's http(s) agents accept the
// same `lookup` hook, so axios requests (providers that need form-data /
// stream uploads) get the identical pinned-DNS guard as `this.fetch`.
// `createConnection` is the agents' only hook that still runs for an
// IP-literal host, so the two literal/peer checks go there (it is not in
// @types/node, hence the casts). Returning no socket after `oncreate(err)` is
// how Node's Agent expects a connection to be refused.
function ssrfSafeAgent<T extends http.Agent>(agent: T): T {
  const createConnection = (agent as any).createConnection;
  (agent as any).createConnection = function (
    options: http.ClientRequestArgs,
    oncreate: (err: Error | null, socket?: net.Socket) => void
  ) {
    if (isBlockedLiteral(options.host ?? options.hostname)) {
      oncreate(new Error('Blocked IP'));
      return undefined;
    }
    const socket: net.Socket | undefined = createConnection.call(
      this,
      options,
      oncreate
    );
    socket?.once('connect', () => {
      if (isBlockedPeer(socket)) {
        socket.destroy(new Error('Blocked IP'));
      }
    });
    return socket;
  };
  return agent;
}

const ssrfSafeAxios = axios.create({
  httpAgent: ssrfSafeAgent(
    new http.Agent({ lookup: ssrfSafeLookup } as http.AgentOptions)
  ),
  httpsAgent: ssrfSafeAgent(
    new https.Agent({
      lookup: ssrfSafeLookup,
    } as https.AgentOptions)
  ),
});

// Self-hosters legitimately connect Postiz to WordPress/Mastodon/Lemmy/Listmonk
// instances that live on a private network (e.g. the same Docker network or VPC).
// Setting DISABLE_SSRF_PROTECTION=true opts those deployments out of the IP
// guard. It stays ON by default so the hosted product is protected.
export function getSsrfSafeDispatcher(): Agent | undefined {
  return process.env.DISABLE_SSRF_PROTECTION === 'true'
    ? undefined
    : ssrfSafeDispatcher;
}

export function getSsrfSafeAxios(): AxiosInstance {
  return process.env.DISABLE_SSRF_PROTECTION === 'true' ? axios : ssrfSafeAxios;
}
