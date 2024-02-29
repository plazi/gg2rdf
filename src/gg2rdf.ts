/* NOTES
- only functions named `make...` output turtle as a side-effect.
- all output is to be handled by `output(...)`.
  This function should not be assumed to run synchronous,
  and all data passed to it should still be valid under reordering of calls.
- before replacing xslt, we should make a test run and compare the rdf for differences.
  Thus the initial goal should be to match xslt 1:1,
  only incorporating improvements after we have confirmed that it is equivalent.
*/

import { DOMParser } from "https://esm.sh/linkedom@0.16.8";
import { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts";
import { parseArgs } from "https://deno.land/std@0.215.0/cli/parse_args.ts";

const flags = parseArgs(Deno.args, {
  string: ["input", "output"],
  alias: { i: "input", o: "output" },
});

if (!flags.input) throw new Error("No input file provided");
if (!flags.output) flags.output = flags.input + ".ttl";

const document = new DOMParser().parseFromString(
  Deno.readTextFileSync(flags.input).replaceAll(/(<\/?)mods:/g, "$1MODS"),
  "text/xml",
);

Deno.writeTextFileSync(flags.output!, ""); // clear prexisting file

output(`@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix bibo: <http://purl.org/ontology/bibo/> .
@prefix cito: <http://purl.org/spar/cito/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix dwc: <http://rs.tdwg.org/dwc/terms/> .
@prefix dwcFP: <http://filteredpush.org/ontologies/oa/dwcFP#> .
@prefix fabio: <http://purl.org/spar/fabio/> .
@prefix plazi: <http://plazi.org/vocab/treatment#> .
@prefix treatment: <http://treatment.plazi.org/id/> .
@prefix taxonName: <http://taxon-name.plazi.org/id/> .
@prefix taxonConcept: <http://taxon-concept.plazi.org/id/> .
@prefix xlink: <http://www.w3.org/1999/xlink/> .
`);

// this is the <document> surrounding everything. doc != document
const doc = document.querySelector("document") as Element;
const id = doc.getAttribute("docId");
console.log("document id :", id);

try {
  checkForErrors();
  makeTreatment();
} catch (error) {
  console.error("" + error);
  output(
    "# There was some Error in gg2rdf\n" +
      ("# " + error).replace(/\n/g, "\n# "),
  );
}

// end of top-level code

/** replaces <xsl:template match="/"> (root template) */
function checkForErrors() {
  const errors: string[] = [];
  const nomenclature: Element | undefined = document.querySelector(
    'document treatment subSubSection[type="nomenclature"]',
  );
  const taxon = nomenclature?.querySelector("taxonomicName");
  if (!taxon) {
    errors.push("the treatment is lacking the taxon");
  } else {
    const rank = taxon.getAttribute("rank");
    if (!rank) errors.push("the treatment taxon is lacking its rank attribute");
    const sigEpithet = normalizeSpace(taxon.getAttribute(rank)); // get the attribute with the rank as the name
    if (sigEpithet.match(/[^a-zA-Z\-]/)) {
      errors.push(`sigEpithet '${sigEpithet}' contains invalid characters`);
    }
    if (
      (rank === "subSpecies" || rank === "variety") &&
      normalizeSpace(taxon.getAttribute("species")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `species '${
          normalizeSpace(taxon.getAttribute("species"))
        }' contains invalid characters`,
      );
    }
    if (
      (rank === "subGenus" || rank === "species" || rank === "subSpecies" ||
        rank === "variety") &&
      normalizeSpace(taxon.getAttribute("genus")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `genus '${
          normalizeSpace(taxon.getAttribute("genus"))
        }' contains invalid characters`,
      );
    }
    if (
      (rank === "subFamily" || rank === "tribe" || rank === "subTribe") &&
      normalizeSpace(taxon.getAttribute("family")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `family '${
          normalizeSpace(taxon.getAttribute("family"))
        }' contains invalid characters`,
      );
    }
    if (
      rank === "subOrder" &&
      normalizeSpace(taxon.getAttribute("order")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `order '${
          normalizeSpace(taxon.getAttribute("order"))
        }' contains invalid characters`,
      );
    }
    if (
      rank === "subClass" &&
      normalizeSpace(taxon.getAttribute("class")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `class '${
          normalizeSpace(taxon.getAttribute("class"))
        }' contains invalid characters`,
      );
    }
    if (
      rank === "subPhylum" &&
      normalizeSpace(taxon.getAttribute("phylum")).match(/[^a-zA-Z\-]/)
    ) {
      errors.push(
        `phylum '${
          normalizeSpace(taxon.getAttribute("phylum"))
        }' contains invalid characters`,
      );
    }
    if (!taxon.getAttribute("kingdom")) {
      console.warn(
        "Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
      output(
        "# Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
    }
  }
  if (errors.length) {
    throw new Error(
      "Cannot produce RDF XML due to data errors:\n - " + errors.join("\n - "),
    );
  }
}

/** outputs turtle describing the treatment
 *
 * replaces <xsl:template match="document"> and <xsl:template match="treatment"> (incomplete)
 */
function makeTreatment() {
  output(`treatment:${id}
    dc:creator ${getAuthors()} ;
    a plazi:Treatment .`);
}

/** → turtle snippet a la `"author1", "author2", ... "authorN"` */
function getAuthors() {
  const docAuthor = (doc.getAttribute("docAuthor") as string).split(/;|,|&|and/)
    .map((a) => STR(a.trim())).join(", ");
  // to keep author ordering (after xslt replaced):
  // const docAuthor = STR(doc.getAttribute("docAuthor"))

  const mods = document.getElementsByTagName(
    "MODSname",
  );
  const modsAuthor = mods.filter((m) =>
    m.querySelector("MODSroleTerm").innerText.match(/author/i)
  ).map((m) =>
    STR((m.querySelector("MODSnamePart").innerText as string).trim())
  ).join(", ");
  // to keep author ordering (after xslt replaced):
  // const modsAuthor = STR(mods.filter((m) => m.querySelector("MODSroleTerm").innerText.match(/author/i)).map((m) => (m.querySelector("MODSnamePart").innerText as string).trim()).join("; "));

  if (modsAuthor) return modsAuthor;
  else if (docAuthor) return docAuthor;
  else console.error("can't determine treatment authors");
}

function STR(s: string) {
  return `"${s.replace(/"/g, `\\"`).replace(/\n/g, "\\n")}"`;
}

function normalizeSpace(s: string) {
  // deno-lint-ignore no-control-regex
  return s.replace(/(\x20|\x09|\x0A|\x0D)+/, " ").trim();
}

/** this function should only be called with valid turtle segments,
 * i.e. full triples, always ending with `.` */
function output(data: string) {
  Deno.writeTextFileSync(flags.output!, data + "\n", { append: true });
}
