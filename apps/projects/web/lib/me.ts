// The signed-in person and a few session facts, readable outside React (context-menu builders run in event handlers).
import type { Person } from '../../shared/api.ts';

let me: Person | null = null;
let canCreate = false;
export const setMe = (p: Person | null, create = false) => { me = p; canCreate = create; };
export const getMe = (): Person | null => me;
export const getCanCreate = (): boolean => canCreate;
