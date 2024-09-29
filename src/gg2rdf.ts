import { DOMParser, iso6393To1, parseArgs } from "./deps.ts";
import type { Element } from "https://esm.sh/v135/linkedom@0.16.8/types/interface/element.d.ts"; // this does not work if imported via deps.ts for unclear reasons

class Subject {
  properties: { [key: string]: Set<string> } = {};
  /** @param uri The uri between '<' and '>' or a  prefixed name*/
  constructor(public uri: string) {}

  /** sorted with comments first, and type last */
  get propNames() {
    return Object.getOwnPropertyNames(this.properties).sort((a, b) => {
      if (a === b) return 0;
      if (
        a.startsWith("#") && b.startsWith("#")
      ) return a.slice(1) < b.slice(1) ? -1 : 1;
      if (a.startsWith("#")) return -1;
      if (b.startsWith("#")) return 1;
      if (a === "a") return 1;
      if (b === "a") return -1;
      return a < b ? -1 : 1;
    });
  }

  addProperty(predicate: string, object: string) {
    if (!Object.hasOwn(this.properties, predicate)) {
      this.properties[predicate] = new Set();
    }
    this.properties[predicate].add(object);
  }
}

if (import.meta.main) {
  // we are running as a standalone program
  const flags = parseArgs(Deno.args, {
    string: ["input", "output"],
    alias: { i: "input", o: "output" },
  });

  if (!flags.input) throw new Error("No input file provided");
  if (!flags.output) flags.output = flags.input + ".ttl";
  gg2rdf(flags.input, flags.output);
}

// Note that the order is important, as code will only ever update the status to a higher one.
export const enum Status {
  successful,
  has_warnings,
  has_errors,
  failed,
}

export function gg2rdf(
  inputPath: string,
  outputPath: string,
  log: (msg: string) => void = console.log,
): Status {
  const document = new DOMParser().parseFromString(
    Deno.readTextFileSync(inputPath).replaceAll(/(<\/?)mods:/g, "$1MODS"),
    "text/xml",
  );

  Deno.writeTextFileSync(outputPath!, ""); // clear prexisting file

  output(`@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix bibo: <http://purl.org/ontology/bibo/> .
@prefix cito: <http://purl.org/spar/cito/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix dwc: <http://rs.tdwg.org/dwc/terms/> .
@prefix dwcFP: <http://filteredpush.org/ontologies/oa/dwcFP#> .
@prefix fabio: <http://purl.org/spar/fabio/> .
@prefix trt: <http://plazi.org/vocab/treatment#> .
@prefix xlink: <http://www.w3.org/1999/xlink/> .`);

  // this is the <document> surrounding everything. doc != document
  const doc = document.querySelector("document") as Element;
  if (!doc) {
    log(`Error: missing <document> in ${inputPath}.\n Could not start gg2rdf.`);
    output("# Error: Could not create RDF due to missing <document>");
    return Status.failed;
  }
  const id = partialURI(doc.getAttribute("docId") || "") || "MISSING_ID";
  log(`starting gg2rdf on document id: ${id}`);

  // saving properties, as they might be collated from multiple ELements
  const taxonConcepts: Subject[] = [];
  const taxonNames: Subject[] = [];
  const figures: Subject[] = [];
  const citedMaterials: Subject[] = [];

  let status: Status = Status.successful;

  const treatmentTaxon = getTreatmentTaxon();

  try {
    makeTreatment();
    makePublication();

    taxonConcepts.forEach(outputSubject);
    taxonNames.forEach(outputSubject);
    figures.forEach(outputSubject);
    citedMaterials.forEach(outputSubject);
  } catch (error) {
    log(error);
    output(
      `# There was some Error in gg2rdf\n${error}`.replaceAll(/\n/g, "\n# "),
    );
    return Status.failed;
  }

  const enum REL {
    CITES,
    SAME,
    NONE,
    DEPRECATES,
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

  return status;

  // end of top-level code

  /** replaces <xsl:template match="/"> (root template) */
  function getTreatmentTaxon(): { uri: string | null; el: Element } | null {
    const taxon: Element | undefined = document.querySelector(
      'document treatment subSubSection[type="nomenclature"] taxonomicName',
    );

    if (!taxon) {
      log("Error: the treatment is lacking the taxon");
      output("# Error: the treatment is lacking the taxon");
      status = Math.max(status, Status.has_errors);
    } else if (!taxon.getAttribute("kingdom")) {
      log(
        "Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
      output(
        "# Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
      status = Math.max(status, Status.has_warnings);
    }

    return taxon ? { el: taxon, uri: null } : null;
  }

  function checkForEpithetErrors(taxon: Element): string[] {
    const errors: string[] = [];
    const rank = taxon.getAttribute("rank");
    if (!rank) {
      errors.push("the rank attribute is missing");
      return errors;
    }
    const sigEpithet = normalizeSpace(taxon.getAttribute(rank)); // get the attribute with the rank as the name
    const isValid = (
      name: string,
    ) => (!!name && (!name.match(/[^a-zA-Z.\-'’]/) ||
      !!name.match(/(undefined|sp\.?|species)\s*-?[0-9]*$/)));
    if (!isValid(sigEpithet)) {
      errors.push(
        `sigEpithet ${STR(sigEpithet)} contains invalid characters`,
      );
    }
    if (
      (rank === "subSpecies" || rank === "variety") &&
      !isValid(normalizeSpace(taxon.getAttribute("species")))
    ) {
      errors.push(
        `species ${
          STR(taxon.getAttribute("species"))
        } contains invalid characters`,
      );
    }
    if (
      (rank === "subGenus" || rank === "species" || rank === "subSpecies" ||
        rank === "variety") &&
      !isValid(normalizeSpace(taxon.getAttribute("genus")))
    ) {
      errors.push(
        `genus ${STR(taxon.getAttribute("genus"))} contains invalid characters`,
      );
    }
    if (
      (rank === "subFamily" || rank === "tribe" || rank === "subTribe") &&
      !isValid(normalizeSpace(taxon.getAttribute("family")))
    ) {
      errors.push(
        `family ${
          STR(taxon.getAttribute("family"))
        } contains invalid characters`,
      );
    }
    if (
      rank === "subOrder" &&
      !isValid(normalizeSpace(taxon.getAttribute("order")))
    ) {
      errors.push(
        `order ${STR(taxon.getAttribute("order"))} contains invalid characters`,
      );
    }
    if (
      rank === "subClass" &&
      !isValid(normalizeSpace(taxon.getAttribute("class")))
    ) {
      errors.push(
        `class ${STR(taxon.getAttribute("class"))} contains invalid characters`,
      );
    }
    if (
      rank === "subPhylum" &&
      !isValid(normalizeSpace(taxon.getAttribute("phylum")))
    ) {
      errors.push(
        `phylum ${
          STR(taxon.getAttribute("phylum"))
        } contains invalid characters`,
      );
    }
    return errors;
  }

  /** outputs turtle describing the treatment
   *
   * replaces <xsl:template match="document"> and <xsl:template match="treatment"> */
  function makeTreatment() {
    const t = new Subject(URI(`http://treatment.plazi.org/id/${id}`));

    if (treatmentTaxon) {
      const taxon = treatmentTaxon.el;
      const epithetErrors = checkForEpithetErrors(taxon);
      if (epithetErrors.length) {
        epithetErrors.forEach((e) => {
          t.addProperty("# Warning: Could not add treatment taxon because", e);
          log(`Warning: Could not add treatment taxon because ${e}`);
          status = Math.max(status, Status.has_warnings);
        });
      } else {
        const rank: string = taxon.getAttribute("rank");
        const taxonStatus: string = taxon.getAttribute("status") ??
          taxon.parentNode.querySelector(
            `taxonomicName ~ taxonomicNameLabel[rank="${rank}"]`,
          )?.innerText ?? "ABSENT";

        const is_defining = taxonStatus !== "nomen dubium" &&
          (taxonStatus !== "ABSENT" ||
            taxon.parentNode.querySelector(
              `taxonomicName ~ taxonomicNameLabel`,
            ));

        const taxonConcept = makeTaxonConcept(taxon, is_defining);

        // add reference to subject taxon concept, using taxon name as a fallback if we're lacking a valid authority
        if (!taxonConcept.ok) {
          // no valid authority given, fall back to taxon name
          t.addProperty("trt:treatsTaxonName", taxonConcept.tnuri);
        } else {
          // we have a valid authority, go for the taxon stringconcept
          if (taxonStatus === "nomen dubium") {
            t.addProperty(`trt:deprecates`, taxonConcept.uri);
          } else if (is_defining) {
            t.addProperty(`trt:definesTaxonConcept`, taxonConcept.uri);
          } else {
            t.addProperty(`trt:augmentsTaxonConcept`, taxonConcept.uri);
          }
          treatmentTaxon.uri = taxonConcept.uri;
        }

        const treatmentTaxonSubject = taxonNames.find((tn) =>
          tn.uri === taxonConcept.tnuri
        );
        if (!treatmentTaxonSubject) {
          log("# Warning: Lost treatment-taxon, cannot add vernacular names");
          status = Math.max(status, Status.has_warnings);
        } else {
          doc.querySelectorAll("vernacularName").forEach((v: Element) => {
            const language = v.getAttribute("language") || undefined;
            const tag = language ? iso6393To1[language] : undefined;
            if (tag) {
              treatmentTaxonSubject.addProperty(
                "dwc:vernacularName",
                `${STR(normalizeSpace(v.innerText))}@${tag}`,
              );
            } else {
              treatmentTaxonSubject.addProperty(
                "dwc:vernacularName",
                STR(normalizeSpace(v.innerText)),
              );
              treatmentTaxonSubject.addProperty(
                "# Info:",
                `Couldn't generate language tag for ${
                  STR(normalizeSpace(v.innerText))
                }@${language}`,
              );
              log(
                `Info: Couldn't generate language tag for ${
                  STR(normalizeSpace(v.innerText))
                }@${language}`,
              );
            }
          });
        }
      }
    }

    if (doc.hasAttribute("docTitle")) {
      t.addProperty("dc:title", STR(doc.getAttribute("docTitle")));
    }

    t.addProperty(`dc:creator`, getAuthors());
    t.addProperty(`trt:publishedIn`, getPublication());

    // add cited taxon concepts
    document.querySelectorAll(
      "subSubSection[type='reference_group'] treatmentCitationGroup, subSubSection[type='reference_group'] treatmentCitation, subSubSection[type='reference_group'] taxonomicName",
    ).forEach((e: Element) => {
      if (
        (e.tagName === "treatmentCitation" &&
          e.closest("treatmentCitationGroup")) ||
        (e.tagName === "taxonomicName" &&
          (e.closest("treatmentCitation") ||
            e.closest("treatmentCitationGroup")))
      ) {
        return;
      }
      const cTaxon = e.tagName === "taxonomicName"
        ? e
        : e.querySelector("taxonomicName");
      if (cTaxon) {
        try {
          addTaxonConceptCitation(t, cTaxon);
        } catch (error) {
          log(error);
          t.addProperty(
            "# Error:",
            `Could not add TaxonConceptCitation\n${error}`
              .replaceAll(/\n/g, "\n# "),
          );
          status = Math.max(status, Status.has_errors);
        }
      } else {
        log(`${e.tagName} found without taxonomicName`);
      }
    });

    // makeCitedMaterial returns the identifier
    const materials = document.querySelectorAll("materialsCitation").map(
      makeCitedMaterial,
    ).filter((c: string) => !!c).join(", ");
    if (materials) t.addProperty(`dwc:basisOfRecord`, materials);

    const figures = [
      ...(new Set(
        document.querySelectorAll(
          "figureCitation[httpUri], figureCitation[figureDoi]",
        ).map(makeFigure),
      )),
    ].join(", ");
    if (figures) t.addProperty(`cito:cites`, figures);

    t.addProperty(`a`, `trt:Treatment`);

    outputSubject(t);
  }

  function getFigureUri(f: Element) {
    const uri = f.getAttribute("httpUri") ?? "";
    if (uri.includes("10.5281/zenodo.")) {
      return URI(uri);
    }
    if (uri.includes("zenodo.")) {
      return URI(`http://dx.doi.org/10.5281/zenodo.${
        substringAfter(
          substringBefore(uri.replaceAll(" ", ""), "/files/"),
          "/record/",
        )
      }`);
    }
    const doi = f.getAttribute("figureDoi") ?? "";
    if (doi.includes("doi.org/10.")) {
      return URI(doi);
    }
    if (doi) {
      return URI(`http://dx.doi.org/${doi}`);
    }
    if (uri) return URI(uri);
    throw new Error(
      "Internal: getFigureUri called with figure that has neither @httpUri nor @figureDoi",
    );
  }

  /** replaces <xsl:template match="figureCitation" mode="subject">
   * @returns figure uri
   */
  function makeFigure(f: Element): string {
    const uri = getFigureUri(f);

    const prev = figures.find((t) => t.uri === uri);
    const s = prev || new Subject(uri);
    if (!prev) figures.push(s);

    if (f.hasAttribute("captionText")) {
      s.addProperty(`dc:description`, STR(f.getAttribute("captionText")));
    }

    const httpUri = (f.getAttribute("httpUri") as string || "").replaceAll(
      " ",
      "",
    );
    if (httpUri) {
      if (httpUri.includes("10.5281/zenodo.")) {
        s.addProperty(
          `fabio:hasRepresentation`,
          URI(
            `https://zenodo.org/record/${
              substringAfter(httpUri, "10.5281/zenodo.")
            }/files/figure.png`,
          ),
        );
      } else {
        s.addProperty(`fabio:hasRepresentation`, URI(httpUri));
      }
    }

    s.addProperty("a", "fabio:Figure");
    return uri;
  }

  /** outputs turtle describing the cTaxon concept
   * @returns object with
   * - ok: could create taxon-concept
   * - uri?: uri of taxon-concept or `undefined` if invalid authority
   * - tnuri: uri of taxon-name
   * both returned uris are valid turtle uris
   */
  function makeTaxonConcept(
    cTaxon: Element,
    is_defining: boolean,
  ): { ok: false; tnuri: string } | { ok: true; uri: string; tnuri: string } {
    const { authority, warnings, fallback_doc_info } = getFullAuthority(
      cTaxon,
      is_defining,
    );

    const taxonRelation = getTaxonRelation(cTaxon);
    const cTaxonRankGroup = getTaxonRankGroup(cTaxon);

    const tnuri = taxonNameURI(cTaxon);
    makeTaxonName(cTaxon);

    if (authority === "INVALID") {
      log(`Warning: Invalid Authority for ${tnuri}`);
      status = Math.max(status, Status.has_warnings);
      return { ok: false, tnuri };
    }

    const year = authority.match(/[0-9]+/)?.[0] || "";
    const cTaxonAuthority = `_${authorityNameForURI(authority)}_${
      partialURI(year)
    }`;

    const uri = taxonConceptURI({
      taxonName: cTaxon,
      taxonAuthority: cTaxonAuthority,
    });

    const prev = taxonConcepts.find((t) => t.uri === uri);
    const s = prev || new Subject(uri);
    if (!prev) taxonConcepts.push(s);

    s.addProperty("trt:hasTaxonName", tnuri);

    // check required attributes
    if (
      cTaxonRankGroup === RANKS.INVALID ||
      taxonRelation === REL.NONE
    ) {
      if (cTaxonRankGroup === RANKS.INVALID) {
        s.addProperty("# Error:", "Invalid Rank");
        status = Math.max(status, Status.has_errors);
      }
      if (taxonRelation === REL.NONE) {
        s.addProperty("# Error:", "Invalid taxon relation");
        status = Math.max(status, Status.has_errors);
      }
      s.addProperty("a", "dwcFP:TaxonConcept");
      return { ok: true, uri, tnuri };
    }

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
      !n.match(/\.|evidence|Evicence|lsidName/)
    ).forEach((n: string) => {
      // the xslt seems to special-case this, but output comparison suggests otherwise?
      // this is because it was only changed recently, so the change was not immediately obvious.
      // see https://github.com/plazi/gg2rdf/issues/10
      if (n === "ID-CoL") {
        s.addProperty(
          "rdfs:seeAlso",
          URI(
            `https://www.catalogueoflife.org/data/taxon/${
              normalizeSpace(cTaxon.getAttribute(n))
            }`,
          ),
        );
      } else {
        s.addProperty(`dwc:${n}`, STR(normalizeSpace(cTaxon.getAttribute(n))));
      }
    });

    // for debugging only
    // s.addProperty("trt:verbatim", STR(cTaxon.innerText));

    warnings.forEach((w) => s.addProperty("# Warning:", w));
    s.addProperty("dwc:scientificNameAuthorship", STR(authority));

    if (fallback_doc_info) {
      // if taxon is the treated taxon and no explicit authority info is given on the element, fall back to document info
      // unclear why dwc:authority* are only set in this one case
      // also unlcear why they are simplified like in the uri
      // TODO: change this if appropriate
      let docAuthor = normalizeSpace(doc.getAttribute("docAuthor"))
        .replaceAll(
          /([^,@&]+),\s+[^,@&]+/g,
          "$1@",
        ).replaceAll(
          "@&",
          " &",
        ).replaceAll(
          "@",
          "",
        );
      if (docAuthor.length >= 2) {
        docAuthor = docAuthor.replaceAll(
          /\w[A-Z]+\b[^.]|\w[A-Z]+$/g,
          (s) => s[0] + s.slice(1).toLowerCase(),
        );
      }
      s.addProperty(
        `dwc:authority`,
        STR(
          normalizeAuthority(
            `${docAuthor}, ${doc.getAttribute("docDate")}`,
          ),
        ),
      );
      s.addProperty(
        "dwc:authorityName",
        STR(docAuthor),
      );
      s.addProperty(
        "dwc:authorityYear",
        STR(doc.getAttribute("docDate")),
      );
      s.addProperty(
        "# Info:",
        "authority attributes generated from docAuthor",
      );
    }

    s.addProperty("a", "dwcFP:TaxonConcept");
    return { ok: true, uri, tnuri };
  }

  /** gets the human-readable authority string for the cTaxon */
  function getFullAuthority(
    cTaxon: Element,
    allow_defining = true,
  ): { authority: string; warnings: string[]; fallback_doc_info?: boolean } {
    let fullAuthority = "INVALID";
    const warnings: string[] = [];

    let baseAuthority: string = cTaxon.getAttribute("baseAuthorityName") ?? "";
    if (baseAuthority) {
      baseAuthority = baseAuthority.replace(/\bin\b[^0-9]*/, "");
      if (baseAuthority === "L.") baseAuthority = "Linnaeus";
      if (baseAuthority.length >= 2 && !/[a-z]/.test(baseAuthority)) {
        baseAuthority = baseAuthority.replaceAll(
          /\w[A-Z]+\b[^.]|\w[A-Z]+$/g,
          (s) => s[0] + s.slice(1).toLowerCase(),
        );
      }

      if (baseAuthority.includes("(") || baseAuthority.includes(")")) {
        const inside = baseAuthority.match(/\(.*\)/)?.[0] ??
          baseAuthority.match(/\(.*$/)?.[0] ??
          baseAuthority.match(/^.*\)/)?.[0] ?? "";
        if (/[a-zA-Z]/.test(inside) && inside != baseAuthority) {
          warnings.push(`Removing "${inside}" from baseAuthority`);
          status = Math.max(status, Status.has_warnings);
          baseAuthority = baseAuthority.replace(inside, "").trim();
        }
      }

      if (cTaxon.hasAttribute("baseAuthorityYear")) {
        baseAuthority += ", " + cTaxon.getAttribute("baseAuthorityYear");
      }

      baseAuthority = normalizeAuthority("(" + baseAuthority + ")");
    }
    let authority: string = cTaxon.getAttribute("authorityName") ?? "";
    if (authority) {
      authority = authority.replace(/\bin\b[^0-9]*/, "");
      if (authority === "L.") authority = "Linnaeus";
      if (authority.length >= 2 && !/[a-z]/.test(authority)) {
        authority = authority.replaceAll(
          /\w[A-Z]+\b[^.]|\w[A-Z]+$/g,
          (s) => s[0] + s.slice(1).toLowerCase(),
        );
      }

      if (authority.includes("(") || authority.includes(")")) {
        const inside = authority.match(/\(.*\)/)?.[0] ??
          authority.match(/\(.*$/)?.[0] ??
          authority.match(/^.*\)/)?.[0] ?? "";
        if (/[a-zA-Z]/.test(inside) && inside != authority) {
          warnings.push(`Removing "${inside}" from authority`);
          status = Math.max(status, Status.has_warnings);
          authority = authority.replace(inside, "").trim();
        }
      }

      if (cTaxon.hasAttribute("authorityYear")) {
        authority += ", " + cTaxon.getAttribute("authorityYear");
      } else if (allow_defining && !/[0-9]/.test(authority)) {
        // if this treatment defines this taxon and the authority given contains no year / numbers, infer from docDate
        warnings.push(`Using document metadata for authority year`);
        authority += ", " + doc.getAttribute("docDate");
      }

      authority = normalizeAuthority(authority);
      if (baseAuthority) {
        // ensures the baseAuthority is not present twice
        authority = authority
          .replaceAll(baseAuthority, "@@@")
          .replaceAll(/\(?@@@\)?[,:;\s]*/g, "");
      }
      authority = normalizeSpace(authority);
    }
    if (baseAuthority && authority) {
      // Animalia has baseAuthority only in this case, all other Kingdoms get both.
      if (getKingdom(cTaxon) === "Animalia") {
        fullAuthority = baseAuthority;
      } else {
        fullAuthority = baseAuthority + " " + authority;
      }
    } else if (baseAuthority) {
      fullAuthority = baseAuthority;
    } else if (authority) {
      fullAuthority = authority;
    } else if (cTaxon.getAttribute("authority")) {
      let authority: string = cTaxon.getAttribute("authority") ?? "";
      if (authority) {
        authority = authority.replace(/\bin\b[^0-9]*/, "");
        if (authority === "L.") authority = "Linnaeus";
        if (authority.length >= 2 && !/[a-z]/.test(authority)) {
          authority = authority.replaceAll(
            /\w[A-Z]+\b[^.]|\w[A-Z]+$/g,
            (s) => s[0] + s.slice(1).toLowerCase(),
          );
        }

        if (cTaxon.hasAttribute("authorityYear")) {
          authority += ", " + cTaxon.getAttribute("authorityYear");
        } else if (allow_defining && !/[0-9]/.test(authority)) {
          // if this treatment defines this taxon and the authority given contains no year / numbers, infer from docDate
          warnings.push(`Using document metadata for authority year`);
          authority += ", " + doc.getAttribute("docDate");
        }

        authority = normalizeAuthority(authority);
      }
      fullAuthority = authority;
    } else if (allow_defining) {
      // if taxon is the treated taxon and no explicit authority info is given on the element, fall back to document info
      let docAuthor = normalizeSpace(doc.getAttribute("docAuthor"))
        .replaceAll(
          /([^,@&]+),\s+[^,@&]+/g,
          "$1@",
        ).replaceAll(
          "@&",
          " &",
        ).replaceAll(
          "@",
          "",
        );
      if (docAuthor.length >= 2) {
        docAuthor = docAuthor.replaceAll(
          /\w[A-Z]+\b[^.]|\w[A-Z]+$/g,
          (s) => s[0] + s.slice(1).toLowerCase(),
        );
      }
      fullAuthority = normalizeAuthority(
        `${docAuthor}, ${doc.getAttribute("docDate")}`,
      );
      return { authority: fullAuthority, warnings, fallback_doc_info: true };
    }
    return { authority: fullAuthority, warnings };
  }

  /** for dwc:scientificNameAuthorship and dwc:authority */
  function normalizeAuthority(a: string): string {
    if (!a) return "";
    let result = normalizeSpace(a)
      .replace(
        /\s*,*\s*(\(?[0-9]{4}?)[^\)]*(\)?).*$/,
        ", $1$2",
      )
      .replaceAll('"', "")
      .replaceAll("'", "")
      .replaceAll(/(?:\b\p{Uppercase_Letter}\.\s*)+(\w+)/ug, "$1")
      .replaceAll(/\s+and\s+/gi, " & ")
      .replaceAll(/\s+[Ee][Tt]\s+([^a])/g, " & $1")
      .replace(/\)\)$/, ")")
      .replace(/^\(\(/, "(")
      .replace(/^\s*[,:;]+\s*/, "")
      .replace(/\s*[,:;]+\s*$/, "")
      .trim();
    if (result.indexOf("&") != result.lastIndexOf("&")) {
      const split = result.split("&").map((s) => s.trim());
      result = split.slice(0, -1).join(", ") + " & " + split.at(-1);
    }
    if (result.lastIndexOf("(") > result.lastIndexOf(")")) {
      result += ")"; // sometimes closing brace is missing
    }
    return result;
  }

  /** replaces <xsl:template match="materialsCitation[@specimenCode]" mode="subject"> */
  function makeCitedMaterial(c: Element): string {
    const mcId = c.getAttribute("id");
    const httpUri = c.getAttribute("httpUri");
    const gbifOccurrenceId = c.getAttribute("ID-GBIF-Occurrence");
    const specimenCode = c.getAttribute("specimenCode");

    const uri = mcId
      ? URI(`http://tb.plazi.org/GgServer/dwcaRecords/${id}.mc.${mcId}`)
      : (gbifOccurrenceId
        ? URI(`https://www.gbif.org/occurrence/${gbifOccurrenceId}`)
        : (httpUri ? URI(httpUri) : URI(
          `http://treatment.plazi.org/id/${id}/${partialURI(specimenCode)}`,
          "_",
        )));

    if (!mcId && !httpUri && !specimenCode) {
      output(
        "# Warning: Failed to output a material citation, could not create identifier",
      );
      status = Math.max(status, Status.has_warnings);
      return "";
    }

    const prev = citedMaterials.find((t) => t.uri === uri);
    const s = prev || new Subject(uri);
    if (!prev) citedMaterials.push(s);

    const addProp = (xml: string, rdf: string) => {
      if (c.hasAttribute(xml)) {
        s.addProperty(rdf, STR(c.getAttribute(xml)));
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

    if (httpUri) {
      s.addProperty("trt:httpUri", URI(httpUri));
    }
    if (mcId) {
      s.addProperty(
        "trt:httpUri",
        URI(`https://treatment.plazi.org/id/${id}#${mcId}`),
      );
    }

    s.addProperty("a", "dwc:MaterialCitation");
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

    const prev = taxonNames.find((t) => t.uri === uri);
    const s = prev || new Subject(uri);
    if (!prev) taxonNames.push(s);

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
      "section",
      "subSection",
      "series",
      "species",
      "undef-species",
      "subSpecies",
      "variety",
      "form",
    ].filter((r) => taxon.hasAttribute(r));

    let rank = taxon.getAttribute("rank");

    if (rankLimit) {
      if (rankLimit === "kingdom") return ""; // nowhere else to go!
      if (ranks.indexOf(rankLimit) >= 0) {
        ranks = ranks.slice(0, ranks.indexOf(rankLimit));
        rank = ranks[ranks.length - 1];
      }
    }

    if (!ranks.includes(rank)) {
      ranks.push(rank);
    }

    let nextRankLimit = "";

    ranks.map((n: string) => {
      const attr = taxon.getAttribute(n);
      if (attr) {
        s.addProperty(`dwc:${n}`, STR(normalizeSpace(attr)));
        if ((attr + "").includes(".")) {
          s.addProperty("# Warning:", `abbreviated ${n} ${STR(attr)}`);
          if (!rankLimit) log(`Warning: abbreviated ${n} ${STR(attr)}`);
          status = Math.max(status, Status.has_warnings);
        }
        nextRankLimit = n;
      }
    });

    if (nextRankLimit) {
      s.addProperty("dwc:rank", STR(nextRankLimit));
    }

    if (nextRankLimit === "kingdom") { /* stop recursion */ }
    else if (nextRankLimit && rankLimit !== nextRankLimit) {
      const parent = makeTaxonName(taxon, nextRankLimit);
      if (parent && parent !== uri) s.addProperty("trt:hasParentName", parent);
    } else {
      log(`Warning: Could not determine parent name of ${uri}`);
      s.addProperty("# Warning:", "Could not determine parent name");
      status = Math.max(status, Status.has_warnings);
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
    const s = new Subject(getPublication());

    const titles = [
      ...document.querySelectorAll("MODSmods>MODStitleInfo>MODStitle"),
    ]
      .map((e: Element) => STR(e.innerText)).join(", ");
    if (titles) s.addProperty(`dc:title`, titles);

    s.addProperty(`dc:creator`, getAuthors());

    document.querySelectorAll(
      "MODSpart > MODSdate, MODSoriginInfo > MODSdateIssued",
    ).forEach((e: Element) => s.addProperty(`dc:date`, STR(e.innerText)));

    // <xsl:apply-templates select="//figureCitation[./@httpUri and not(./@httpUri = ./preceding::figureCitation/@httpUri)]" mode="publicationObject"/>
    const figures = [
      ...(new Set(
        document.querySelectorAll(
          "figureCitation[httpUri], figureCitation[figureDoi]",
        ).map(makeFigure),
      )),
    ].join(", ");
    if (figures) s.addProperty(`fabio:hasPart`, figures);

    const classifications = document.querySelectorAll("MODSclassification");
    classifications.forEach((c: Element) => {
      if (c.innerText === "journal article") {
        [...document.querySelectorAll('MODSrelatedItem[type="host"]')].map(
          (a) => getJournalProperties(a, s),
        );
      }
      if (c.innerText === "book chapter") {
        [...document.querySelectorAll('MODSrelatedItem[type="host"]')].map(
          (a) => getBookChapterProperties(a, s),
        );
      }
      if (c.innerText === "book") {
        s.addProperty("a", "fabio:Book");
      }
    });

    outputSubject(s);
  }

  function getJournalProperties(e: Element, s: Subject) {
    e.querySelectorAll("MODStitleInfo > MODStitle").forEach((m: Element) =>
      s.addProperty(`bibo:journal`, STR(m.innerText))
    );
    // <xsl:apply-templates select="mods:part/mods:detail"/>
    e.querySelectorAll("MODSpart > MODSdetail").forEach((m: Element) => {
      s.addProperty(
        `bibo:${m.getAttribute("type")}`,
        `"${normalizeSpace(m.innerText)}"`,
      );
    });
    // <xsl:apply-templates select="mods:part/mods:extent/mods:start"/>
    e.querySelectorAll("MODSpart > MODSextent > MODSstart").forEach(
      (m: Element) => {
        s.addProperty(`bibo:startPage`, `"${normalizeSpace(m.innerText)}"`);
      },
    );
    // <xsl:apply-templates select="mods:part/mods:extent/mods:end"/>
    e.querySelectorAll("MODSpart > MODSextent > MODSend").forEach(
      (m: Element) => {
        s.addProperty(`bibo:endPage`, `"${normalizeSpace(m.innerText)}"`);
      },
    );
    s.addProperty("a", "fabio:JournalArticle");
  }
  function getBookChapterProperties(e: Element, s: Subject) {
    // <xsl:apply-templates select="mods:part/mods:extent/mods:start"/>
    e.querySelectorAll("MODSpart > MODSextent > MODSstart").forEach(
      (m: Element) => {
        s.addProperty(`bibo:startPage`, `"${normalizeSpace(m.innerText)}"`);
      },
    );
    // <xsl:apply-templates select="mods:part/mods:extent/mods:end"/>
    e.querySelectorAll("MODSpart > MODSextent > MODSend").forEach(
      (m: Element) => {
        s.addProperty(`bibo:endPage`, `"${normalizeSpace(m.innerText)}"`);
      },
    );
    s.addProperty("a", "fabio:BookSection");
  }

  /** replaces <xsl:template name="taxonConceptCitation"> */
  function addTaxonConceptCitation(
    t: Subject,
    cTaxon: Element,
  ): void {
    const { authority } = getFullAuthority(cTaxon, false);

    let cTaxonAuthority = authority;

    if (authority !== "INVALID") {
      const year = authority.match(/[0-9]+/)?.[0] || "";
      cTaxonAuthority = `_${authorityNameForURI(authority)}_${
        partialURI(year)
      }`;
    }

    const taxonRelation = getTaxonRelation(cTaxon);
    const cTaxonRankGroup = getTaxonRankGroup(cTaxon);
    // check required attributes
    if (
      cTaxonRankGroup === RANKS.INVALID || !cTaxon.getAttribute("kingdom") ||
      (cTaxonRankGroup === RANKS.species && !cTaxon.getAttribute("genus"))
    ) {
      if (cTaxonAuthority === "INVALID") {
        t.addProperty(
          "# Warning:",
          `Not adding 'trt:citesTaxonName ${
            taxonNameURI(cTaxon)
          }' due to issues with rank`,
        );
      } else {
        t.addProperty(
          "# Warning:",
          `Not adding 'trt:citesTaxonName ${
            taxonConceptURI({
              taxonName: cTaxon,
              taxonAuthority: cTaxonAuthority,
            })
          }' due to issues with rank`,
        );
      }
      status = Math.max(status, Status.has_warnings);
      return;
    }
    if (cTaxonAuthority === "INVALID") {
      // no valid authority cited, fall back to taxon name
      t.addProperty(`trt:citesTaxonName`, taxonNameURI(cTaxon));
      makeTaxonName(cTaxon);
      return;
    }
    if (taxonRelation === REL.CITES) {
      // do not let a citing treatment deprecate a cited name
      const taxonConcept = makeTaxonConcept(cTaxon, false);
      if (taxonConcept.ok) {
        t.addProperty(`cito:cites`, taxonConcept.uri);
      } else {
        t.addProperty(`trt:citesTaxonName`, taxonConcept.tnuri);
      }
      return;
    }
    // do not let a taxon deprecate itself
    // skip taxon names with insufficient attributes
    if (taxonRelation === REL.SAME || taxonRelation === REL.NONE) return;
    // deprecate recombined, renamed, and synonymized names
    const taxonConcept = makeTaxonConcept(cTaxon, false);
    if (taxonConcept.ok) {
      // do not let a taxon deprecate itself
      if (taxonConcept.uri === treatmentTaxon?.uri) return;
      t.addProperty(`trt:deprecates`, taxonConcept.uri);
    } else {
      t.addProperty(`trt:citesTaxonName`, taxonConcept.tnuri);
    }
    return;
  }

  /** replaces <xsl:template name="taxonRelation"> */
  function getTaxonRelation(cTaxon: Element) {
    if (!treatmentTaxon) {
      return REL.CITES;
    }

    const taxon = treatmentTaxon.el;

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

  function getTaxonRankGroup(t: Element): RANKS {
    if (t.getAttribute("species")) return RANKS.species;
    if (t.getAttribute("genus")) return RANKS.genus;
    if (t.getAttribute("tribe") || t.getAttribute("subTribe")) {
      return RANKS.tribe;
    }
    if (t.getAttribute("family") || t.getAttribute("subFamily")) {
      return RANKS.family;
    }
    if (t.getAttribute("order") || t.getAttribute("subOrder")) {
      return RANKS.order;
    }
    if (t.getAttribute("class") || t.getAttribute("subClass")) {
      return RANKS.class;
    }
    if (t.getAttribute("phylum") || t.getAttribute("subPhylum")) {
      return RANKS.phylum;
    }
    if (t.getAttribute("kingdom")) return RANKS.kingdom;
    return RANKS.INVALID;
  }

  /** replaces <xsl:call-template name="authorityNameForURI"> */
  function authorityNameForURI(authorityName: string) {
    // Take baseAuthority if present
    authorityName = substringBefore(authorityName, ")");
    // Take first name given
    authorityName = substringBefore(authorityName, " &");
    authorityName = substringBefore(authorityName, ",");
    // Take Last Name
    authorityName = substringAfter(authorityName, " ");
    const match = authorityName.match(/\p{L}+/u);
    if (match && match[0]) return partialURI(match[0]);
    return partialURI(authorityName);
  }

  /** replaces <xsl:call-template name="taxonNameBaseURI"> */
  function taxonNameBaseURI({ kingdom }: { kingdom: string }) {
    return `http://taxon-name.plazi.org/id/${
      kingdom ? partialURI(kingdom) : "Animalia"
    }`;
  }

  /** returns the end part of a taxon-name uri
   *
   * replaces <xsl:call-template name="taxonNameForURI"> */
  function taxonNameForURI(
    taxonName: Element,
    rankLimit?: string,
  ): string {
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
      "section",
      "subSection",
      "series",
      "species",
      "undef-species",
      "subSpecies",
      "variety",
      "form",
    ].filter((r) => taxonName.hasAttribute(r));

    let rank = taxonName.getAttribute("rank");

    if (rankLimit) {
      if (rankLimit === "kingdom") return ""; // nowhere else to go!
      if (ranks.indexOf(rankLimit) > 0) {
        ranks = ranks.slice(0, ranks.indexOf(rankLimit));
        rank = ranks[ranks.length - 1];
      }
    }
    if (rank === "kingdom") return "";

    if (
      [
        "subGenus",
        "section",
        "subSection",
        "series",
        "species",
        "undef-species",
        "subSpecies",
        "variety",
        "form",
      ].includes(rank)
    ) {
      const names: string[] = [
        taxonName.getAttribute("genus"),
        ranks.includes("species")
          ? taxonName.getAttribute("species")
          // only put subGenus if no species present
          : [
            taxonName.getAttribute("subGenus"),
            taxonName.getAttribute("section"),
            taxonName.getAttribute("subSection"),
            taxonName.getAttribute("series"),
          ],
        ranks.includes("undef-species")
          ? taxonName.getAttribute("undef-species")
          : "",
        ranks.includes("subSpecies")
          ? taxonName.getAttribute("subSpecies")
          : "",
        ranks.includes("variety") ? taxonName.getAttribute("variety") : "",
        ranks.includes("form") ? taxonName.getAttribute("form") : "",
      ];
      return "/" +
        partialURI(
          names.flat().map(removePunctuation).filter((n) => !!n).join("_")
            .replaceAll(".", ""),
        );
    } else {
      const sigEpithet = removePunctuation(
        normalizeSpace(taxonName.getAttribute(rank)),
      );
      if (sigEpithet) {
        return "/" +
          partialURI(sigEpithet.replaceAll(".", ""));
      } else {
        throw new Error("Could not produce taxonNameURI");
      }
    }
  }

  /** replaces <xsl:call-template name="taxonConceptURI">
   *
   * @returns valid turtle uri
   */
  function taxonNameURI(taxonName: Element, rankLimit?: string) {
    return URI(
      taxonNameBaseURI({ kingdom: taxonName.getAttribute("kingdom") }) +
        taxonNameForURI(taxonName, rankLimit),
      "_",
    );
  }

  /** Get kingdom of taxonName
   *
   * If `taxonName.getAttribute("kingdom")` is falsy (e.g. null or empty), returns "Animalia".
   */
  function getKingdom(taxonName: Element) {
    return taxonName.getAttribute("kingdom") || "Animalia";
  }

  /** returns plain uri
   *
   * replaces <xsl:call-template name="taxonConceptBaseURI"> */
  function taxonConceptBaseURI({ kingdom }: { kingdom: string }) {
    return `http://taxon-concept.plazi.org/id/${kingdom}`;
  }

  /** returns valid turtle uri
   *
   * replaces <xsl:call-template name="taxonConceptURI"> */
  function taxonConceptURI(
    { taxonName, taxonAuthority }: {
      taxonName: Element;
      taxonAuthority: string;
    },
  ) {
    return URI(
      taxonConceptBaseURI({ kingdom: getKingdom(taxonName) }) +
        taxonNameForURI(taxonName) + taxonAuthority,
    );
  }

  /** → turtle snippet a la `"author1", "author2", ... "authorN"` */
  function getAuthors() {
    // xslt never uses docAuthor
    // const docAuthor = (doc.getAttribute("docAuthor") as string).split(/;|,|&|and/)
    //   .map((a) => STR(a.trim())).join(", ");
    // to keep author ordering (after xslt replaced):
    // const docAuthor = STR(doc.getAttribute("docAuthor"))

    const mods = document.querySelectorAll("MODSname") as Element[];
    const modsAuthor = STR(
      mods.filter((m) =>
        (m.querySelector("MODSroleTerm")?.innerText as string)?.match(/author/i)
      ).map((m) =>
        (m.querySelector("MODSnamePart")?.innerText as string).trim()
      )
        .join("; "),
    );

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
      return URI(
        `http://publication.plazi.org/id/${
          partialURI(doc.getAttribute("masterDocId"))
        }`,
      );
    }
    if (doiID.includes("doi.org")) {
      return escapeDoi(doiID);
    }
    const docSource: string | undefined = doc.getAttribute("docSource");
    if (docSource?.includes("doi.org")) {
      return escapeDoi(docSource);
    }
    return escapeDoi(`http://dx.doi.org/${doiID}`);
  }

  function escapeDoi(uri: string) {
    return URI(uri);
    // TODO: check if this is enough or if more advanced escaping is neccesary
    // <xsl:template name="escapeDoi"> is very complicated, but I dont understand why exactly
  }

  function removePunctuation(s: string) {
    if (!s) return "";
    const result = s.replaceAll(/(?:\p{Z}|\p{S}|\p{P})(?<![-])/ug, "");
    if (result !== s) {
      log(`Warning: Normalizing "${s}" to "${result}".`);
      status = Math.max(status, Status.has_warnings);
    }
    return result;
  }

  function STR(s: string) {
    if (!s) return `""`;
    return JSON.stringify(String(s));
  }

  /** removes reserved uri characters from `s`, to be later passed to URI */
  function partialURI(s: string) {
    if (!s) return "";
    return normalizeSpace(s.replaceAll(/[;\/\?:@&=\+\$,#]+/g, " "));
  }

  function URI(uri: string, replaceSpace = "") {
    if (!uri) return "[]"; // unique blank node
    return `<${encodeURI(uri.trim().replaceAll(/\s+/g, replaceSpace))}>`;
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
    return s.replaceAll(/\s+/g, " ").trim();
  }

  /** this function should only be called with valid turtle segments,
   * i.e. full triples, always ending with `.` */
  function output(data: string) {
    Deno.writeTextFileSync(outputPath, data + "\n", { append: true });
  }

  function outputSubject(s: Subject) {
    if (s.propNames.length) {
      if (s.propNames[s.propNames.length - 1].startsWith("#")) {
        output(
          `\n# No properties for ${s.uri}\n    ${
            s.propNames.map((n) => `${n} ${[...s.properties[n]].join(", ")}`)
              .join(
                " ;\n    ",
              )
          }`,
        );
      } else {
        output(
          `\n${s.uri}\n    ${
            s.propNames.map((n) => `${n} ${[...s.properties[n]].join(", ")}`)
              .join(
                " ;\n    ",
              )
          } .`,
        );
      }
    } else output(`\n# No properties for ${s.uri}`);
  }
}
