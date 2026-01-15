/**
 * Global Type Definitions for ShieldPM
 *
 * @typedef {number} Integer
 *
 * @typedef {Object} AccessToken
 * @property {(...args: any[]) => number} getUserId
 * @property {() => string} getScope
 * @property {(key: string) => any} get
 * @property {(scope: string) => boolean} hasScope
 *
 * @typedef {Object} Access
 * @property {AccessToken} token
 * @property {(permission: string, ...args: any[]) => Promise<any>} can
 * @property {(token: any) => Promise<void>} load
 * @property {boolean} [is_ai]
 */

export default {};
