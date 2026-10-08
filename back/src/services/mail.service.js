import nodemailer from 'nodemailer';
import env from '../config/env.js';

let transport = null;

/**
 * Under test nothing may touch the network, so an unconfigured transport
 * serialises the message instead of sending it. Tests that care what was
 * sent install their own with setMailTransport.
 */
const buildTransport = () => {
  if (env.NODE_ENV === 'test') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
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
