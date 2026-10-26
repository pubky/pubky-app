/**
 * The viewer's IP country as the Shop's region route reports it, or `unavailable` when the route could
 * not answer. `ready` with a null country means the edge answered but could not tell where the viewer is.
 */
export type TClientCountryResult = { status: 'ready'; country: string | null } | { status: 'unavailable' };
