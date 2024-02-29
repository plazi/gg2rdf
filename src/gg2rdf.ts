/* NOTES
- only functions named `make...` output turtle as a side-effect.
- all output is to be handled by `output(...)` or `outputProperties`.
  This function should not be assumed to run synchronous,
  and all data passed to it should still be valid under reordering of calls.
- before replacing xslt, we should make a test run and compare the rdf for differences.
  Thus the initial goal should be to match xslt 1:1,
  only incorporating improvements after we have confirmed that it is equivalent.
*/

import { DOMParser } from "https://esm.sh/linkedom@0.16.8/cached";
import { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts";
import { parseArgs } from "https://deno.land/std@0.215.0/cli/parse_args.ts";

const flags = parseArgs(Deno.args, {
  string: ["input", "output"],
  alias: { i: "input", o: "output" },
});

if (!flags.input) throw new Error("No input file provided");
if (!flags.output) flags.output = flags.input + ".ttl";

class Subject {
  uri: string;
  properties: { [key: string]: Set<string> };

  constructor(uri: string) {
    this.uri = uri;
    this.properties = {};
  }

  get propNames() {
    return Object.getOwnPropertyNames(this.properties);
  }

  addProperty(predicate: string, object: string) {
    if (!Object.hasOwn(this.properties, predicate)) {
      this.properties[predicate] = new Set();
    }
    this.properties[predicate].add(object);
  }
}

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
@prefix trt: <http://plazi.org/vocab/treatment#> .
@prefix treatment: <http://treatment.plazi.org/id/> .
@prefix xlink: <http://www.w3.org/1999/xlink/> .`);

// this is the <document> surrounding everything. doc != document
const doc = document.querySelector("document") as Element;
const id = doc.getAttribute("docId");
// console.log("document id :", id);

// don't output tc/tn's twice
const alreadyDoneTC: Subject[] = [];
const alreadyDoneTN: Subject[] = [];
// saving properties, as they might be collated from multiple ELements

// don't output figuress twice
const alreadyDoneFigures: string[] = [];

try {
  checkForErrors();
  makeTreatment();
  makeTaxonConcepts();
  makePublication();
  makeFigures();
  outputTNandTC();
} catch (error) {
  console.error(error);
  output(
    "# There was some Error in gg2rdf\n" +
      ("# " + error).replace(/\n/g, "\n# "),
  );
}

// end of top-level code

function outputTNandTC() {
  alreadyDoneTC.forEach(outputSubject);
  alreadyDoneTN.forEach(outputSubject);
}

/** replaces <xsl:template match="/"> (root template) */
function checkForErrors() {
  const errors: string[] = [];
  const taxon: Element | undefined = document.querySelector(
    'document treatment subSubSection[type="nomenclature"] taxonomicName',
  );
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
 * replaces <xsl:template match="document"> and <xsl:template match="treatment"> */
function makeTreatment() {
  // lines of turtle properties `pred obj`
  // subject and delimiters are added at the end.
  const properties: string[] = [];

  const taxon: Element = document.querySelector(
    'document treatment subSubSection[type="nomenclature"] taxonomicName',
  ); // existence asserted by checkForErrors
  const rank: string = taxon.getAttribute("rank");
  const taxonStatus: string = taxon.getAttribute("status") ??
    taxon.parentNode.querySelector(
      `taxonomicName ~ taxonomicNameLabel[rank="${rank}"]`,
    )?.innerText ?? "ABSENT";

  const taxonAuthority = getAuthority({ taxonName: taxon, taxonStatus });

  // add reference to subject taxon concept, using taxon name as a fallback if we're lacking a valid authority
  if (taxonAuthority === "INVALID") {
    // no valid authority given, fall back to taxon name
    properties.push(
      `trt:treatsTaxonName ${taxonNameURI(taxon)}`,
    );
  } else {
    // we have a valid authority, go for the taxon stringconcept
    if (
      taxonStatus !== "ABSENT" ||
      taxon.parentNode.querySelector(`taxonomicName ~ taxonomicNameLabel`)
    ) {
      properties.push(
        `trt:definesTaxonConcept ${
          taxonConceptURI({ taxonName: taxon, taxonAuthority })
        }`,
      );
    } else {
      properties.push(
        `trt:augmentsTaxonConcept ${
          taxonConceptURI({ taxonName: taxon, taxonAuthority })
        }`,
      );
    }
  }

  properties.push(`dc:creator ${getAuthors()}`);
  properties.push(`trt:publishedIn ${getPublication()}`);

  // add cited taxon concepts
  document.querySelectorAll(
    "subSubSection[type='reference_group'] treatmentCitationGroup, subSubSection[type='reference_group'] treatmentCitation, subSubSection[type='reference_group'] taxonomicName",
  ).forEach((e: Element) => {
    if (
      (e.tagName === "treatmentCitation" &&
        e.closest("treatmentCitationGroup")) ||
      (e.tagName === "taxonomicName" &&
        (e.closest("treatmentCitation") || e.closest("treatmentCitationGroup")))
    ) {
      return;
    }
    const cTaxon = e.tagName === "taxonomicName"
      ? e
      : e.querySelector("taxonomicName");
    const citation = taxonConceptCitation(taxon, cTaxon);
    if (citation) properties.push(citation);
  });

  // makeCitedMaterial returns the identifier
  const materials = document.querySelectorAll("materialsCitation").map(
    makeCitedMaterial,
  ).filter((c: string) => !!c).join(", ");
  if (materials) properties.push(`dwc:basisOfRecord ${materials}`);

  const figures = [
    ...(new Set(
      document.querySelectorAll(
        "figureCitation[httpUri], figureCitation[figureDoi]",
      ).map(getFigureUri),
    )),
  ].join(", ");
  if (figures) properties.push(`cito:cites ${figures}`);

  properties.push(`a trt:Treatment`);

  outputProperties(`treatment:${id}`, properties);

  makeTaxonName(taxon);
}

function getFigureUri(f: Element) {
  const uri = f.getAttribute("httpUri") ?? "";
  if (uri.includes("10.5281/zenodo.")) {
    return `<${uri.replaceAll(" ", "")}>`;
  }
  if (uri.includes("zenodo.")) {
    return `<http://dx.doi.org/10.5281/zenodo.${
      substringAfter(
        substringBefore(uri.replaceAll(" ", ""), "/files/"),
        "/record/",
      )
    }>`;
  }
  const doi = f.getAttribute("figureDoi") ?? "";
  if (doi.includes("doi.org/10.")) return `<${doi.replaceAll(" ", "")}>`;
  if (doi) return `<http://dx.doi.org/${doi.replaceAll(" ", "")}>`;
  if (uri) return `<${uri}>`;
  throw new Error(
    "Internal: getFigureUri called with figure that has neither @httpUri nor @figureDoi",
  );
}

function makeFigures() {
  document.querySelectorAll(
    "figureCitation[httpUri], figureCitation[figureDoi]",
  ).forEach(makeFigure);
}

/** replaces <xsl:template match="figureCitation" mode="subject"> */
function makeFigure(f: Element) {
  const properties: string[] = [];
  const uri = getFigureUri(f);

  if (alreadyDoneFigures.includes(uri)) return;
  alreadyDoneFigures.push(uri);

  if (f.hasAttribute("captionText")) {
    properties.push(`dc:description ${STR(f.getAttribute("captionText"))}`);
  }

  const httpUri = f.getAttribute("httpUri");
  if (httpUri) {
    if (httpUri.replaceAll(" ", "").includes("10.5281/zenodo.")) {
      properties.push(
        `fabio:hasRepresentation https://zenodo.org/record/${
          STR(substringAfter(httpUri.replaceAll(" ", ""), "10.5281/zenodo."))
        }/files/figure.png`,
      );
    } else {
      properties.push(
        `fabio:hasRepresentation ${STR(httpUri.replaceAll(" ", ""))}`,
      );
    }
  }

  properties.push(`a fabio:Figure`);
  outputProperties(uri, properties);
}

/** outputs turtle describing the taxon concepts mentioned */
function makeTaxonConcepts() {
  const taxon: Element = document.querySelector(
    'document treatment subSubSection[type="nomenclature"] taxonomicName',
  ); // existence asserted by checkForErrors
  makeTaxonConcept(taxon, taxon);
  document.querySelectorAll("taxonomicName").forEach((e: Element) => {
    makeTaxonConcept(taxon, e);
  });
}

/** outputs turtle describing the cTaxon concept */
function makeTaxonConcept(taxon: Element, cTaxon: Element) {
  const rank: string = cTaxon.getAttribute("rank");
  const cTaxonStatus: string = cTaxon.getAttribute("status") ??
    taxon.parentNode.querySelector(
      `taxonomicName ~ taxonomicNameLabel[rank="${rank}"]`,
    )?.innerText ?? "ABSENT";

  const cTaxonAuthority = getAuthority({
    taxonName: cTaxon,
    taxonStatus: cTaxonStatus,
  });
  const taxonRelation = getTaxonRelation({ taxon, cTaxon });
  const cTaxonRankGroup = getTaxonRankGroup(cTaxon);

  // check required attributes
  if (
    cTaxonRankGroup === RANKS.INVALID || cTaxonAuthority === "INVALID" ||
    taxonRelation === REL.NONE
  ) {
    return;
  }

  const uri = taxonConceptURI({
    taxonName: cTaxon,
    taxonAuthority: cTaxonAuthority,
  });

  const prev = alreadyDoneTC.find((t) => t.uri === uri);
  const s = prev || new Subject(uri);
  if (!prev) alreadyDoneTC.push(s);

  /** replaces <xsl:template name="taxonNameDetails"> and <xsl:template match="taxonomicName/@*"> */
  cTaxon.getAttributeNames().filter((n: string) =>
    ![
      "id",
      "box",
      "pageId",
      "pageNumber",
      "lastPageId",
      "lastPageNumber",
      "higherTaxonomySource",
      "status",
    ].includes(n) && !n.startsWith("_") &&
    !n.match(/\.|authority|Authority|evidence|Evicence|lsidName/)
  ).forEach((n: string) => {
    // the xslt seems to special-case this, but output comparison suggests otherwise?
    // if (n === "ID-CoL") {
    //   return `rdf:seeAlso <https://www.catalogueoflife.org/data/taxon/${
    //     normalizeSpace(taxon.getAttribute(n))
    //   }>`;
    // }
    s.addProperty(`dwc:${n}`, STR(normalizeSpace(cTaxon.getAttribute(n))));
  });

  s.addProperty("trt:hasTaxonName", taxonNameURI(cTaxon));

  if (cTaxon.getAttribute("authority")) {
    s.addProperty(
      "dwc:scientificNameAuthorship",
      STR(normalizeSpace(cTaxon.getAttribute("authority"))),
    );
  } else if (
    cTaxon.getAttribute("baseAuthorityName") &&
    cTaxon.getAttribute("baseAuthorityYear")
  ) {
    s.addProperty(
      "dwc:scientificNameAuthorship",
      `${
        STR(
          normalizeSpace(
            `${cTaxon.getAttribute("baseAuthorityName")}, ${
              cTaxon.getAttribute("baseAuthorityYear")
            }`,
          ),
        )
      }`,
    );
  } else if (
    cTaxon.getAttribute("authorityName") &&
    cTaxon.getAttribute("authorityYear")
  ) {
    s.addProperty(
      "dwc:scientificNameAuthorship",
      STR(
        normalizeSpace(
          `${cTaxon.getAttribute("authorityName")}, ${
            cTaxon.getAttribute("authorityYear")
          }`,
        ),
      ),
    );
  } else if (taxon === cTaxon) {
    // if taxon is the treated taxon and no explicit authority info is given on the element, fall back to document info
    s.addProperty(
      "dwc:scientificNameAuthorship",
      STR(
        normalizeSpace(
          `${doc.getAttribute("docAuthor")}, ${doc.getAttribute("docDate")}`,
        ),
      ),
    );
  }
  if (taxon === cTaxon && !taxon.hasAttribute("authority")) {
    // if taxon is the treated taxon and no explicit authority info is given on the element, fall back to document info
    // unclear why dwc:authority* are only set in this one case
    // also unlcear why they are simplified like in the uri
    // TODO: change this if appropriate
    s.addProperty(
      `dwc:authority`,
      STR(
        normalizeSpace(
          `${authorityNameForURI(doc.getAttribute("docAuthor"))}, ${
            doc.getAttribute("docDate")
          }`,
        ),
      ),
    );
    s.addProperty(
      "dwc:authorityName",
      STR(normalizeSpace(authorityNameForURI(doc.getAttribute("docAuthor")))),
    );
    s.addProperty(
      "dwc:authorityYear",
      STR(doc.getAttribute("docDate")),
    );
  }

  s.addProperty("a", "dwcFP:TaxonConcept");
  makeTaxonName(cTaxon);
}

/** replaces <xsl:template match="materialsCitation[@specimenCode]" mode="subject"> */
function makeCitedMaterial(c: Element): string {
  const properties: string[] = [];
  const mcId = c.getAttribute("id");
  const httpUri = c.getAttribute("httpUri");
  const specimenCode = c.getAttribute("specimenCode");

  // TODO remove (&& !specimenCode)
  const uri = (mcId && !specimenCode)
    ? `<http://tb.plazi.org/GgServer/dwcaRecords/${id}.mc.${mcId}>`
    : (httpUri
      ? `<${httpUri}>`
      : `<http://treatment.plazi.org/id/${id}/${
        encodeURIComponent(normalizeSpace(c.getAttribute("specimenCode")))
      }>`);

  if (!mcId && !httpUri && !specimenCode) {
    output(
      "# Warning: Failed to output a material citation, could not create identifier",
    );
    return "";
  }

  const addProp = (xml: string, rdf: string) => {
    if (c.hasAttribute(xml)) {
      properties.push(`${rdf} ${STR(c.getAttribute(xml))}`);
    }
  };

  addProp("specimenCode", "dwc:catalogNumber");
  addProp("collectionCode", "dwc:collectionCode");
  addProp("typeStatus", "dwc:typeStatus");
  addProp("latitude", "dwc:verbatimLatitude");
  addProp("longitude", "dwc:verbatimLongitude");
  addProp("elevation", "dwc:verbatimElevation");
  addProp("collectingCountry", "dwc:countryCode");
  addProp("collectingRegion", "dwc:stateProvince");
  addProp("collectingMunicipality", "dwc:municipality");
  addProp("collectingCounty", "dwc:county");
  addProp("location", "dwc:locality");
  addProp("locationDeviation", "dwc:verbatimLocality");
  addProp("collectorName", "dwc:recordedBy");
  addProp("collectingDate", "dwc:eventDate");
  addProp("collectingMethod", "dwc:samplingProtocol");
  addProp("ID-GBIF-Occurrence", "trt:gbifOccurrenceId");
  addProp("ID-GBIF-Specimen", "trt:gbifSpecimenId");
  addProp("httpUri", "trt:httpUri");

  if (mcId) {
    properties.push(
      `trt:httpUri <https://treatment.plazi.org/id/${id}#${mcId}>`,
    );
  }

  properties.push("a dwc:MaterialCitation");
  outputProperties(uri, properties);
  return uri;
}

/** replaces <xsl:template name="taxonName">
 *
 * @param rankLimit treat taxon as if it's rank was strictly above rankLimit
 * @returns identifier of parent name
 */
function makeTaxonName(taxon: Element, rankLimit?: string): string {
  const uri = taxonNameURI(taxon, rankLimit);

  // TODO there are some checks in the xslt which abort outputting a tn -- are they neccesary?

  const prev = alreadyDoneTN.find((t) => t.uri === uri);
  const s = prev || new Subject(uri);
  if (!prev) alreadyDoneTN.push(s);

  let ranks = [
    "kingdom",
    "phylum",
    "subPhylum",
    "class",
    "subClass",
    "order",
    "subOrder",
    "superFamily",
    "family",
    "subFamily",
    "tribe",
    "subTribe",
    "genus",
    "subGenus",
    "species",
    "subSpecies",
    "variety",
  ].filter((r) => taxon.hasAttribute(r));

  let rank = taxon.getAttribute("rank");

  if (rankLimit) {
    if (rankLimit === "kingdom") return ""; // nowhere else to go!
    if (ranks.indexOf(rankLimit) > 0) {
      ranks = ranks.slice(0, ranks.indexOf(rankLimit));
      rank = ranks[ranks.length - 1];
    }
  }

  if (!ranks.includes(rank)) {
    ranks.push(rank);
  }

  let nextRankLimit = "";

  ranks.map((n: string) => {
    if (taxon.getAttribute(n)) {
      s.addProperty(`dwc:${n}`, STR(normalizeSpace(taxon.getAttribute(n))));
      nextRankLimit = n;
    }
  });

  s.addProperty("dwc:rank", STR(nextRankLimit));

  if (rankLimit !== nextRankLimit) {
    const parent = makeTaxonName(taxon, nextRankLimit); // recurse upwards until kingdom
    if (parent) s.addProperty("trt:hasParentName", parent);
  } else {
    console.warn("makeTaxonName reached endless loop");
    s.addProperty("#", "Warning: makeTaxonName reached endless loop");
  }

  s.addProperty("a", "dwcFP:TaxonName");
  return uri;
}

/** outputs turtle describing the publication
 *
 * replaces <xsl:template name="publication">
 */
function makePublication() {
  // lines of turtle properties `pred obj`
  // subject and delimiters are added at the end.
  const properties: string[] = [];

  const titles = [
    ...document.querySelectorAll("MODSmods>MODStitleInfo>MODStitle"),
  ]
    .map((e: Element) => normalizeSpace(e.innerText)).join('", "');
  if (titles) properties.push(`dc:title "${titles}"`);

  properties.push(`dc:creator ${getAuthors()}`);

  document.querySelectorAll(
    "MODSpart > MODSdate, MODSoriginInfo > MODSdateIssued",
  ).forEach((e: Element) =>
    properties.push(`dc:date ${JSON.stringify("" + e.innerText)}`)
  );

  // <xsl:apply-templates select="//figureCitation[./@httpUri and not(./@httpUri = ./preceding::figureCitation/@httpUri)]" mode="publicationObject"/>
  const figures = [
    ...(new Set(
      document.querySelectorAll(
        "figureCitation[httpUri], figureCitation[figureDoi]",
      ).map(getFigureUri),
    )),
  ].join(", ");
  if (figures) properties.push(`fabio:hasPart ${figures}`);

  const classifications = document.querySelectorAll("MODSclassification");
  classifications.forEach((c: Element) => {
    if (c.innerText === "journal article") {
      [...document.querySelectorAll('MODSrelatedItem[type="host"]')].map(
        getJournalProperties,
      ).flat().forEach((s) => properties.push(s));
    }
    if (c.innerText === "book chapter") {
      [...document.querySelectorAll('MODSrelatedItem[type="host"]')].map(
        getBookChapterProperties,
      ).flat().forEach((s) => properties.push(s));
    }
    if (c.innerText === "book") {
      properties.push("a fabio:Book");
    }
  });

  outputProperties(`${getPublication()}`, properties);
}

function getJournalProperties(e: Element): string[] {
  const result: string[] = [];
  e.querySelectorAll("MODStitleInfo > MODStitle").forEach((m: Element) =>
    result.push(`bibo:journal ${JSON.stringify("" + m.innerText)}`)
  );
  // <xsl:apply-templates select="mods:part/mods:detail"/>
  e.querySelectorAll("MODSpart > MODSdetail").forEach((m: Element) => {
    result.push(
      `bibo:${m.getAttribute("type")} "${normalizeSpace(m.innerText)}"`,
    );
  });
  // <xsl:apply-templates select="mods:part/mods:extent/mods:start"/>
  e.querySelectorAll("MODSpart > MODSextent > MODSstart").forEach(
    (m: Element) => {
      result.push(`bibo:startPage "${normalizeSpace(m.innerText)}"`);
    },
  );
  // <xsl:apply-templates select="mods:part/mods:extent/mods:end"/>
  e.querySelectorAll("MODSpart > MODSextent > MODSend").forEach(
    (m: Element) => {
      result.push(`bibo:endPage "${normalizeSpace(m.innerText)}"`);
    },
  );
  result.push("a fabio:JournalArticle");
  return result;
}
function getBookChapterProperties(e: Element): string[] {
  const result: string[] = [];
  // <xsl:apply-templates select="mods:part/mods:extent/mods:start"/>
  e.querySelectorAll("MODSpart > MODSextent > MODSstart").forEach(
    (m: Element) => {
      result.push(`bibo:startPage "${normalizeSpace(m.innerText)}"`);
    },
  );
  // <xsl:apply-templates select="mods:part/mods:extent/mods:end"/>
  e.querySelectorAll("MODSpart > MODSextent > MODSend").forEach(
    (m: Element) => {
      result.push(`bibo:endPage "${normalizeSpace(m.innerText)}"`);
    },
  );
  result.push("a fabio:BookSection");
  return result;
}

/** replaces <xsl:template name="taxonConceptCitation"> */
function taxonConceptCitation(
  taxon: Element,
  cTaxon: Element,
): string | undefined {
  const cTaxonAuthority = getAuthority({
    taxonName: cTaxon,
    taxonStatus: "ABSENT",
  });
  const taxonRelation = getTaxonRelation({ taxon, cTaxon });
  const cTaxonRankGroup = getTaxonRankGroup(cTaxon);
  // check required attributes
  if (
    cTaxonRankGroup === RANKS.INVALID || !cTaxon.getAttribute("kingdom") ||
    (cTaxonRankGroup === RANKS.species && !cTaxon.getAttribute("genus"))
  ) return;
  if (cTaxonAuthority === "INVALID") {
    // no valid authority cited, fall back to taxon name
    return `trt:citesTaxonName ${taxonNameURI(cTaxon)}`;
  }
  if (taxonRelation === REL.CITES) {
    // do not let a citing treatment deprecate a cited name
    return `cito:cites ${
      taxonConceptURI({ taxonName: cTaxon, taxonAuthority: cTaxonAuthority })
    }`;
  }
  // do not let a taxon deprecate itself
  // skip taxon names with insufficient attributes
  if (taxonRelation === REL.SAME || taxonRelation === REL.NONE) return;
  // deprecate recombined, renamed, and synonymized names
  return `trt:deprecates ${
    taxonConceptURI({ taxonName: cTaxon, taxonAuthority: cTaxonAuthority })
  }`;
}

const enum REL {
  CITES,
  SAME,
  NONE,
  DEPRECATES,
}

/** replaces <xsl:template name="taxonRelation"> */
function getTaxonRelation(
  { taxon, cTaxon }: { taxon: Element; cTaxon: Element },
) {
  const authorityMatch = (cTaxon.hasAttribute("authorityYear") &&
    cTaxon.getAttribute("authorityYear") ===
      taxon.getAttribute("authorityYear") &&
    cTaxon.getAttribute("authorityName") ===
      taxon.getAttribute("authorityName")) ||
    (cTaxon.hasAttribute("baseAuthorityYear") &&
      cTaxon.getAttribute("baseAuthorityYear") ===
        taxon.getAttribute("baseAuthorityYear") &&
      cTaxon.getAttribute("baseAuthorityName") ===
        taxon.getAttribute("baseAuthorityName"));
  const taxonRankGroup = getTaxonRankGroup(taxon);
  const cTaxonRankGroup = getTaxonRankGroup(cTaxon);
  if (taxonRankGroup === RANKS.INVALID || cTaxonRankGroup === RANKS.INVALID) {
    // don't let taxon with invalid rank deprecate any other taxon
    // catch cited taxon with invalid rank
    return REL.NONE;
  }
  // make sure to not deprecate across rank groups
  if (taxonRankGroup !== cTaxonRankGroup) return REL.CITES;
  if (!taxon.getAttribute("genus") || !cTaxon.getAttribute("genus")) {
    // exclude deprecation above genus for now
    return REL.CITES;
  }
  if (
    cTaxon.getAttribute("rank") === "genus" &&
    taxon.getAttribute("rank") !== "genus" &&
    cTaxon.getAttribute("genus") === taxon.getAttribute("genus")
  ) {
    // make sure to not deprecate own parent genus (subGenus is same rank group)
    return REL.CITES;
  }
  if (
    cTaxon.getAttribute("rank") === "species" &&
    taxon.getAttribute("rank") !== "species" &&
    cTaxon.getAttribute("genus") === taxon.getAttribute("genus") &&
    cTaxon.getAttribute("species") === taxon.getAttribute("species")
  ) {
    // make sure to not deprecate own parent species (subSpecies and variety are same rank group)
    return REL.CITES;
  }
  if (
    authorityMatch &&
    cTaxon.getAttribute("rank") === taxon.getAttribute("rank") &&
    cTaxon.getAttribute("genus") === taxon.getAttribute("genus") &&
    cTaxon.getAttribute("subGenus") === taxon.getAttribute("subGenus") &&
    cTaxon.getAttribute("species") === taxon.getAttribute("species") &&
    cTaxon.getAttribute("subSpecies") === taxon.getAttribute("subSpecies") &&
    cTaxon.getAttribute("variety") === taxon.getAttribute("variety")
  ) {
    // catch genuine citations of previous treatments
    return REL.SAME;
  }
  return REL.DEPRECATES;
}

const enum RANKS {
  INVALID,
  kingdom,
  phylum,
  class,
  order,
  family,
  tribe,
  genus,
  species,
}

function getTaxonRankGroup(t: Element): RANKS {
  if (t.getAttribute("species")) return RANKS.species;
  if (t.getAttribute("genus")) return RANKS.genus;
  if (t.getAttribute("tribe")) return RANKS.tribe;
  if (t.getAttribute("family")) return RANKS.family;
  if (t.getAttribute("order")) return RANKS.order;
  if (t.getAttribute("class")) return RANKS.class;
  if (t.getAttribute("phylum")) return RANKS.phylum;
  if (t.getAttribute("kingdom")) return RANKS.kingdom;
  return RANKS.INVALID;
}

/** replaces <xsl:call-template name="authority"> */
function getAuthority(
  { taxonName, taxonStatus }: { taxonName: Element; taxonStatus: string },
) {
  const baseAuthorityName: string = taxonName.getAttribute("baseAuthorityName");
  const baseAuthorityYear: string = taxonName.getAttribute("baseAuthorityYear");
  const authorityName: string = taxonName.getAttribute("authorityName");
  const authorityYear: string = taxonName.getAttribute("authorityYear");
  const docAuthor: string = doc.getAttribute("docAuthor");
  const docDate: string = doc.getAttribute("docDate");
  if (taxonStatus.includes("ABSENT")) {
    // no status at all, use whichever authority given (basionym authority first, as it tends to be cited for a reason under ICZN code)
    if (baseAuthorityName && baseAuthorityYear) {
      return `_${authorityNameForURI(baseAuthorityName)}_${baseAuthorityYear}`;
    } else if (authorityName && authorityYear) {
      return `_${authorityNameForURI(authorityName)}_${authorityYear}`;
    } else return "INVALID";
  } else if (taxonStatus.includes("nom") || taxonStatus.includes("name")) {
    // newly minted replacement name for homonym or Latin grammar error, use combination or document authority
    return `_${authorityNameForURI(authorityName ?? docAuthor)}_${docDate}`;
  } else if (taxonStatus.includes("comb") || taxonStatus.includes("stat")) {
    // new combination or status of existing epithet, use basionym authority (as that is what will be the most cited under ICZN code)
    if (baseAuthorityName && baseAuthorityYear) {
      return `_${authorityNameForURI(baseAuthorityName)}_${baseAuthorityYear}`;
    } else return "INVALID";
  } else {
    // newly minted taxon name, use document metadata if explicit attributes missing
    if (baseAuthorityName && baseAuthorityYear) {
      return `_${authorityNameForURI(baseAuthorityName)}_${baseAuthorityYear}`;
    } else if (authorityName && authorityYear) {
      return `_${authorityNameForURI(authorityName)}_${authorityYear}`;
    } else {return `_${authorityNameForURI(authorityName || docAuthor)}_${
        authorityYear || docDate
      }`;}
  }
}

/** replaces <xsl:call-template name="authorityNameForURI"> */
function authorityNameForURI(authorityName: string) {
  authorityName = normalizeSpace(authorityName);
  authorityName = substringAfter(authorityName, ") ");
  authorityName = substringAfter(authorityName, ")");
  authorityName = substringAfter(authorityName, "] ");
  authorityName = substringAfter(authorityName, "]");
  authorityName = substringBefore(authorityName, " & ");
  authorityName = substringBefore(authorityName, " et al");
  authorityName = substringBefore(authorityName, ", ");
  authorityName = substringAfter(authorityName, ". ");
  authorityName = substringAfter(authorityName, " ");
  return encodeURIComponent(authorityName);
}

/** replaces <xsl:call-template name="taxonNameBaseURI"> */
function taxonNameBaseURI({ kingdom }: { kingdom: string }) {
  return `http://taxon-name.plazi.org/id/${
    kingdom ? encodeURIComponent(kingdom.replaceAll(" ", "_")) : "Animalia"
  }`;
}

/** returns the end part of a taxon-name uri
 *
 * replaces <xsl:call-template name="taxonNameForURI"> */
function taxonNameForURI(
  { taxonName }: { taxonName: Element | string },
  rankLimit?: string,
) {
  if (typeof taxonName === "string") {
    // unsure if this is ever called with a string?
    if (
      taxonName.includes(",") &&
      !normalizeSpace(substringBefore(taxonName, ",")).includes(" ")
    ) {
      return "/" + normalizeSpace(substringBefore(taxonName, ",")).replaceAll(
        " ",
        "_",
      );
    } else {
      return "/" + normalizeSpace(substringBefore(taxonName, " ")).replaceAll(
        " ",
        "_",
      );
    }
  } else {
    let ranks = [
      "kingdom",
      "phylum",
      "subPhylum",
      "class",
      "subClass",
      "order",
      "subOrder",
      "superFamily",
      "family",
      "subFamily",
      "tribe",
      "subTribe",
      "genus",
      "subGenus",
      "species",
      "subSpecies",
      "variety",
    ].filter((r) => taxonName.hasAttribute(r));

    let rank = taxonName.getAttribute("rank");

    if (rankLimit) {
      if (rankLimit === "kingdom") return; // nowhere else to go!
      if (ranks.indexOf(rankLimit) > 0) {
        ranks = ranks.slice(0, ranks.indexOf(rankLimit));
        rank = ranks[ranks.length - 1];
      }
    }
    if (rank === "kingdom") return "";

    if (
      ["genus", "subGenus", "species", "variety", "subSpecies"].includes(rank)
    ) {
      const names: string[] = [
        taxonName.getAttribute("genus"),
        ranks.includes("species")
          ? taxonName.getAttribute("species")
          : ranks.includes("subGenus")
          ? taxonName.getAttribute("subGenus") // only put subGenus if no species present
          : "",
        ranks.includes("subSpecies")
          ? taxonName.getAttribute("subSpecies")
          : "",
        ranks.includes("variety") ? taxonName.getAttribute("variety") : "",
      ];
      // the variety || subSpecies is due to a quirk of the xslt
      // after replacement, this should proably be modified to put both if avaliable
      return "/" +
        names.filter((n) => !!n).map(normalizeSpace).map((n) =>
          n.replaceAll(" ", "_")
        ).join("_");
    } else {
      return "/" + normalizeSpace(taxonName.getAttribute(rank)).replaceAll(
        " ",
        "_",
      );
    }
  }
}

/** replaces <xsl:call-template name="taxonConceptURI">
 *
 * @returns valid turtle uri
 */
function taxonNameURI(taxonName: Element, rankLimit?: string) {
  return `<${taxonNameBaseURI({ kingdom: taxonName.getAttribute("kingdom") })}${
    taxonNameForURI({ taxonName }, rankLimit)
  }>`;
}

/** returns plain uri
 *
 * replaces <xsl:call-template name="taxonConceptBaseURI"> */
function taxonConceptBaseURI({ kingdom }: { kingdom: string }) {
  return `http://taxon-concept.plazi.org/id/${
    kingdom ? encodeURIComponent(kingdom.replaceAll(" ", "_")) : "Animalia"
  }`;
}

/** returns valid turtle uri
 *
 * replaces <xsl:call-template name="taxonConceptURI"> */
function taxonConceptURI(
  { taxonName, taxonAuthority }: { taxonName: Element; taxonAuthority: string },
) {
  return `<${
    taxonConceptBaseURI({ kingdom: taxonName.getAttribute("kingdom") })
  }${taxonNameForURI({ taxonName })}${taxonAuthority}>`;
}

/** → turtle snippet a la `"author1", "author2", ... "authorN"` */
function getAuthors() {
  // xslt never uses docAuthor
  // const docAuthor = (doc.getAttribute("docAuthor") as string).split(/;|,|&|and/)
  //   .map((a) => STR(a.trim())).join(", ");
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

  // if (modsAuthor)
  return modsAuthor;
  // else if (docAuthor) return docAuthor;
  // else console.error("can't determine treatment authors");
}

/** returns link to publication
 *
 * NOTE: the xslt uses two slight variations of this, but i consider that a bug */
function getPublication() {
  const doiID: string | undefined = doc.getAttribute("ID-DOI");
  if (!doiID) {
    return `<http://publication.plazi.org/id/${
      encodeURIComponent(doc.getAttribute("masterDocId"))
    }>`;
  }
  if (doiID.includes("doi.org")) {
    return escapeDoi((normalizeSpace(doiID)).replaceAll(" ", ""));
  }
  const docSource: string | undefined = doc.getAttribute("docSource");
  if (docSource?.includes("doi.org")) {
    return escapeDoi((normalizeSpace(docSource)).replaceAll(" ", ""));
  }
  return escapeDoi(
    `http://dx.doi.org/${(normalizeSpace(doiID)).replaceAll(" ", "")}`,
  );
}

function escapeDoi(url: string) {
  return `<${encodeURI(url)}>`;
  // TODO: check if this is enough or if more advanced escaping is neccesary
  // <xsl:template name="escapeDoi"> is very complicated, but I dont understand why exactly
}

function STR(s: string) {
  return `"${s.replace(/"/g, `\\"`).replace(/\n/g, "\\n")}"`;
}

/** returns the part of s before c, not including c
 * and returns s if s does not contain c. */
function substringBefore(s: string, c: string) {
  if (!s.includes(c)) return s;
  const index = s.indexOf(c);
  return s.substring(0, index);
}
/** returns the part of s after c, not including c
 * and returns s if s does not contain c. */
function substringAfter(s: string, c: string) {
  if (!s.includes(c)) return s;
  const index = s.lastIndexOf(c) + c.length;
  return s.substring(index);
}

function normalizeSpace(s: string) {
  if (!s) return "";
  // deno-lint-ignore no-control-regex
  return s.replace(/(\x20|\x09|\x0A|\x0D)+/, " ").trim();
}

/** this function should only be called with valid turtle segments,
 * i.e. full triples, always ending with `.` */
function output(data: string) {
  Deno.writeTextFileSync(flags.output!, data + "\n", { append: true });
}

/** the second argument is a list of `predicate object` strings;
 * without delimiters (";" or ".")
 */
function outputProperties(subject: string, properties: string[]) {
  if (properties.length) {
    output(`\n${subject}\n    ${properties.join(" ;\n    ")} .`);
  } else output(`\n# No properties for ${subject}`);
}

function outputSubject(s: Subject) {
  if (s.propNames.length) {
    output(
      `\n${s.uri}\n    ${
        s.propNames.map((n) => `${n} ${[...s.properties[n]].join(", ")}`).join(
          " ;\n    ",
        )
      } .`,
    );
  } else output(`\n# No properties for ${s.uri}`);
}
