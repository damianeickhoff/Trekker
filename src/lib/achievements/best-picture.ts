/**
 * Every Best Picture winner, by title and the year the film came out (not the
 * ceremony, which is always the year after). Append the new winner each spring.
 *
 * Matched by title rather than TMDB id: titles are already on every watched
 * row and are stable, ids would need looking up and keeping in step, and a
 * normalised comparison with two years of slack is enough to be sure.
 * Festival-first films sit under the year TMDB records, which is why the slack
 * exists at all.
 */
export const BEST_PICTURE_WINNERS: [title: string, year: number][] = [
  ["Wings", 1927],
  ["The Broadway Melody", 1929],
  ["All Quiet on the Western Front", 1930],
  ["Cimarron", 1931],
  ["Grand Hotel", 1932],
  ["Cavalcade", 1933],
  ["It Happened One Night", 1934],
  ["Mutiny on the Bounty", 1935],
  ["The Great Ziegfeld", 1936],
  ["The Life of Emile Zola", 1937],
  ["You Can't Take It with You", 1938],
  ["Gone with the Wind", 1939],
  ["Rebecca", 1940],
  ["How Green Was My Valley", 1941],
  ["Mrs. Miniver", 1942],
  ["Casablanca", 1942],
  ["Going My Way", 1944],
  ["The Lost Weekend", 1945],
  ["The Best Years of Our Lives", 1946],
  ["Gentleman's Agreement", 1947],
  ["Hamlet", 1948],
  ["All the King's Men", 1949],
  ["All About Eve", 1950],
  ["An American in Paris", 1951],
  ["The Greatest Show on Earth", 1952],
  ["From Here to Eternity", 1953],
  ["On the Waterfront", 1954],
  ["Marty", 1955],
  ["Around the World in 80 Days", 1956],
  ["The Bridge on the River Kwai", 1957],
  ["Gigi", 1958],
  ["Ben-Hur", 1959],
  ["The Apartment", 1960],
  ["West Side Story", 1961],
  ["Lawrence of Arabia", 1962],
  ["Tom Jones", 1963],
  ["My Fair Lady", 1964],
  ["The Sound of Music", 1965],
  ["A Man for All Seasons", 1966],
  ["In the Heat of the Night", 1967],
  ["Oliver!", 1968],
  ["Midnight Cowboy", 1969],
  ["Patton", 1970],
  ["The French Connection", 1971],
  ["The Godfather", 1972],
  ["The Sting", 1973],
  ["The Godfather Part II", 1974],
  ["One Flew Over the Cuckoo's Nest", 1975],
  ["Rocky", 1976],
  ["Annie Hall", 1977],
  ["The Deer Hunter", 1978],
  ["Kramer vs. Kramer", 1979],
  ["Ordinary People", 1980],
  ["Chariots of Fire", 1981],
  ["Gandhi", 1982],
  ["Terms of Endearment", 1983],
  ["Amadeus", 1984],
  ["Out of Africa", 1985],
  ["Platoon", 1986],
  ["The Last Emperor", 1987],
  ["Rain Man", 1988],
  ["Driving Miss Daisy", 1989],
  ["Dances with Wolves", 1990],
  ["The Silence of the Lambs", 1991],
  ["Unforgiven", 1992],
  ["Schindler's List", 1993],
  ["Forrest Gump", 1994],
  ["Braveheart", 1995],
  ["The English Patient", 1996],
  ["Titanic", 1997],
  ["Shakespeare in Love", 1998],
  ["American Beauty", 1999],
  ["Gladiator", 2000],
  ["A Beautiful Mind", 2001],
  ["Chicago", 2002],
  ["The Lord of the Rings: The Return of the King", 2003],
  ["Million Dollar Baby", 2004],
  ["Crash", 2004],
  ["The Departed", 2006],
  ["No Country for Old Men", 2007],
  ["Slumdog Millionaire", 2008],
  ["The Hurt Locker", 2008],
  ["The King's Speech", 2010],
  ["The Artist", 2011],
  ["Argo", 2012],
  ["12 Years a Slave", 2013],
  ["Birdman", 2014],
  ["Spotlight", 2015],
  ["Moonlight", 2016],
  ["The Shape of Water", 2017],
  ["Green Book", 2018],
  ["Parasite", 2019],
  ["Nomadland", 2020],
  ["CODA", 2021],
  ["Everything Everywhere All at Once", 2022],
  ["Oppenheimer", 2023],
  ["Anora", 2024],
];

/**
 * Lower case, accents and punctuation gone, a leading article dropped: "Ben-Hur"
 * and "Ben Hur" are one film, and so are "The Sting" and "Sting, The".
 */
export function normaliseTitle(title: string) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}

const YEARS_BY_TITLE = new Map<string, number[]>();
for (const [title, year] of BEST_PICTURE_WINNERS) {
  const key = normaliseTitle(title);
  YEARS_BY_TITLE.set(key, [...(YEARS_BY_TITLE.get(key) ?? []), year]);
}

/**
 * Whether a watched film won. The year only breaks ties: several winners share
 * a title with a remake, and the 1953 Titanic should not count.
 */
export function isBestPictureWinner(title: string, year: number | null) {
  const years = YEARS_BY_TITLE.get(normaliseTitle(title));
  if (!years) return false;
  if (year === null) return true;
  return years.some((y) => Math.abs(y - year) <= 2);
}

export const BEST_PICTURE_COUNT = BEST_PICTURE_WINNERS.length;
