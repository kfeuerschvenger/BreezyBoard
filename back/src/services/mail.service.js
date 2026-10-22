import nodemailer from 'nodemailer';
import env from '../config/env.js';

let transport = null;

/**
 * The SMTP connection options for a configuration. Unless the connection is
 * encrypted from the first byte (`secure`), STARTTLS is required rather than
 * attempted: nodemailer's default upgrades only when the server offers it, so
 * anyone on the path who strips the STARTTLS line from the server's greeting
 * leaves the session in plain text with the credentials and the reset link
 * in it, and neither side notices. With `requireTLS` that downgrade fails the
 * send instead. Plain text is possible only through the explicit
 * `SMTP_ALLOW_PLAINTEXT` flag, which exists for the local mail catcher and is
 * refused in production by config/env.js.
 *
 * @param {object} config
 * @returns {import('nodemailer/lib/smtp-transport').Options}
 */
export const smtpOptions = config => ({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  requireTLS: !config.SMTP_SECURE && !config.SMTP_ALLOW_PLAINTEXT,
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
});

/**
 * Under test nothing may touch the network, so an unconfigured transport
 * serialises the message instead of sending it. Tests that care what was
 * sent install their own with setMailTransport.
 *
 * @param {object} [config]
 */
export const buildTransport = (config = env) => {
  if (config.NODE_ENV === 'test') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport(smtpOptions(config));
};

/**
 * Replace the transport. Pass anything with a `sendMail(message)` method, or
 * null to go back to the one built from the environment. Exists so a test
 * can capture the messages the application would have sent.
 *
 * @param {{ sendMail: (message: object) => Promise<unknown> } | null} replacement
 */
export const setMailTransport = replacement => {
  transport = replacement;
};

/**
 * Send one message from the configured sender. The transport is created on
 * first use rather than at import, so loading the application never opens a
 * connection.
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} message
 * @returns {Promise<unknown>}
 */
export const sendMail = async message => {
  transport ??= buildTransport();

  return transport.sendMail({ from: env.MAIL_FROM, ...message });
};
