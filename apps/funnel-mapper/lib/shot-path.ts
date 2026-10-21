// A page capture is stored twice: the full image (peek, exports, up to 1200px wide) and a 208 x 256 picture for the block on
// the map (2x the 104 x 128 picture, top-anchored). The picture lives next to the capture: "<name>.webp" -> "<name>-pic.webp".
export const picPath = (shot: string): string => (/\.webp$/.test(shot) ? shot.replace(/\.webp$/, "-pic.webp") : `${shot}-pic.webp`);
