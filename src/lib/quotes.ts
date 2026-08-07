/**
 * Footer quotes, in place of the old "Data from The Movie Database" line.
 *
 * Kept short and widely-known: a line long enough to be the interesting part of
 * a film is a line long enough to be someone's copyright. One is picked per
 * render, so the footer changes on every reload.
 */

export type Quote = { line: string; source: string };

const QUOTES: Quote[] = [
  { line: "Here's looking at you, kid.", source: "Casablanca" },
  { line: "I'll be back.", source: "The Terminator" },
  { line: "May the Force be with you.", source: "Star Wars" },
  { line: "There's no place like home.", source: "The Wizard of Oz" },
  { line: "To infinity and beyond!", source: "Toy Story" },
  { line: "I am your father.", source: "The Empire Strikes Back" },
  { line: "Life finds a way.", source: "Jurassic Park" },
  { line: "Just keep swimming.", source: "Finding Nemo" },
  { line: "Winter is coming.", source: "Game of Thrones" },
  { line: "I am the one who knocks.", source: "Breaking Bad" },
  { line: "The truth is out there.", source: "The X-Files" },
  { line: "Live long and prosper.", source: "Star Trek" },
  { line: "D'oh!", source: "The Simpsons" },
  { line: "How you doin'?", source: "Friends" },
  { line: "Bears. Beets. Battlestar Galactica.", source: "The Office" },
  { line: "Legen — wait for it — dary.", source: "How I Met Your Mother" },
  { line: "Yada, yada, yada.", source: "Seinfeld" },
  { line: "Elementary, my dear Watson.", source: "Sherlock Holmes" },
  { line: "Nobody puts Baby in a corner.", source: "Dirty Dancing" },
  { line: "Why so serious?", source: "The Dark Knight" },
  { line: "You shall not pass!", source: "The Fellowship of the Ring" },
  { line: "My precious.", source: "The Lord of the Rings" },
  { line: "Wax on, wax off.", source: "The Karate Kid" },
  { line: "Roads? Where we're going we don't need roads.", source: "Back to the Future" },
  { line: "They're here.", source: "Poltergeist" },
  { line: "Say hello to my little friend!", source: "Scarface" },
  { line: "Houston, we have a problem.", source: "Apollo 13" },
  { line: "I see dead people.", source: "The Sixth Sense" },
  { line: "Hasta la vista, baby.", source: "Terminator 2" },
  { line: "Are you not entertained?", source: "Gladiator" },
  { line: "It's alive!", source: "Frankenstein" },
  { line: "Nothing is true, everything is permitted.", source: "Assassin's Creed" },
  { line: "The night is dark and full of terrors.", source: "Game of Thrones" },
  { line: "Clear eyes, full hearts, can't lose.", source: "Friday Night Lights" },
  { line: "Have you tried turning it off and on again?", source: "The IT Crowd" },
  { line: "That's what she said.", source: "The Office" },
  { line: "I drink and I know things.", source: "Game of Thrones" },
  { line: "Science, bitch!", source: "Breaking Bad" },
  { line: "Everything is fine.", source: "The Good Place" },
  { line: "Cool cool cool cool cool.", source: "Brooklyn Nine-Nine" },
];

/** A different one each render — deliberately not memoised or cached. */
export function randomQuote(): Quote {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
