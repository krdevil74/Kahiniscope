/**
 * The story posters behind the sign-in screen.
 *
 * Sixteen covers from the channel's own catalogue, deliberately spread across
 * the four things it makes — mystery, horror, comedy, love — so the wall says
 * what this app is for before anybody has signed in. They are 16:9 and carry
 * their Bengali titles, which is the whole point: a wall of untitled artwork
 * is decoration, a wall of titles is a body of work.
 *
 * Downscaled to 480×270 (~22KB each, 354KB for the set). They are drawn small,
 * dimmed and moving, so anything larger would be bundle weight nobody sees.
 */

export type PosterGenre = "mystery" | "horror" | "comedy" | "love";

export interface Poster {
  /** Metro resolves this at build time; it is a number, not a path. */
  source: number;
  /** The Bengali title on the cover, for the accessibility label. */
  title: string;
  genre: PosterGenre;
}

export const POSTERS: Poster[] = [
  { source: require("../../assets/posters/murder-on-d-hill.jpg"), title: "দ্য মার্ডার কেস অন ডি হিল", genre: "mystery" },
  { source: require("../../assets/posters/aynate-mukh.jpg"), title: "আয়নাতে মুখ দেখব না", genre: "horror" },
  { source: require("../../assets/posters/itor-bishesh.jpg"), title: "ইতর বিশেষ", genre: "comedy" },
  { source: require("../../assets/posters/kotha-hok-mone-mone.jpg"), title: "কথা হোক মনে মনে", genre: "love" },

  { source: require("../../assets/posters/stolen-bank-notes.jpg"), title: "স্টোলেন ব্যাঙ্ক নোটস", genre: "mystery" },
  { source: require("../../assets/posters/nishith-kalindir-dak.jpg"), title: "নিশীথ কালিন্দীর ডাক", genre: "horror" },
  { source: require("../../assets/posters/kolke-kashir-obak-kando.jpg"), title: "কল্কে কাশির অবাক কাণ্ড", genre: "comedy" },
  { source: require("../../assets/posters/tomake-na-lekha-chithi.jpg"), title: "তোমাকে না লেখা চিঠি", genre: "love" },

  { source: require("../../assets/posters/lady-molly.jpg"), title: "লেডি মলি", genre: "mystery" },
  { source: require("../../assets/posters/dainir-bari.jpg"), title: "ডাইনির বাড়ি", genre: "horror" },
  { source: require("../../assets/posters/detective-detector.jpg"), title: "ডিটেকটিভ", genre: "comedy" },
  { source: require("../../assets/posters/chokher-aloy.jpg"), title: "চোখের আলোয়", genre: "love" },

  { source: require("../../assets/posters/lupin-vs-sherlock.jpg"), title: "শার্লক হোমস vs আর্সেন লুপাঁ", genre: "mystery" },
  { source: require("../../assets/posters/konkal-sarothi.jpg"), title: "কঙ্কাল সারথি", genre: "horror" },
  { source: require("../../assets/posters/shamrock-jones.jpg"), title: "শ্যামরক জোন্স", genre: "comedy" },
  { source: require("../../assets/posters/dag.jpg"), title: "দাগ", genre: "mystery" },
];
