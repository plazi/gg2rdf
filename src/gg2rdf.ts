import { DOMParser, parseArgs } from "./deps.ts";
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

export function gg2rdf(
  inputPath: string,
  outputPath: string,
  log: (msg: string) => void = console.log,
) {
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
@prefix treatment: <http://treatment.plazi.org/id/> .
@prefix xlink: <http://www.w3.org/1999/xlink/> .`);

  // this is the <document> surrounding everything. doc != document
  const doc = document.querySelector("document") as Element;
  if (!doc) {
    log(`Error: missing <document> in ${inputPath}.`);
    output("# Could not create RDF due to missing <document>");
  }
  const id = partialURI(doc.getAttribute("docId") || "") || "MISSING_ID";
  log(`starting gg2rdf on document id: ${id}`);

  // saving properties, as they might be collated from multiple ELements
  const taxonConcepts: Subject[] = [];
  const taxonNames: Subject[] = [];
  const figures: Subject[] = [];
  const citedMaterials: Subject[] = [];

  try {
    checkForErrors();
    makeTreatment();
    makePublication();

    taxonConcepts.forEach(outputSubject);
    taxonNames.forEach(outputSubject);
    figures.forEach(outputSubject);
    citedMaterials.forEach(outputSubject);
  } catch (error) {
    log(error);
    output(
      "# There was some Error in gg2rdf\n" +
        ("# " + error).replace(/\n/g, "\n# "),
    );
  }

  // end of top-level code

  /** replaces <xsl:template match="/"> (root template) */
  function checkForErrors() {
    const errors: string[] = [];
    const taxon: Element | undefined = document.querySelector(
      'document treatment subSubSection[type="nomenclature"] taxonomicName',
    );
    if (!taxon) {
      errors.push("the treatment is lacking the taxon");
    } else if (!taxon.getAttribute("kingdom")) {
      log(
        "Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
      output(
        "# Warning: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia'",
      );
    }
    if (errors.length) {
      throw new Error(
        "Cannot produce RDF due to data errors:\n - " +
          errors.join("\n - "),
      );
    }
  }

  function checkForEpithetErrors(taxon: Element): string[] {
    const errors: string[] = [];
    const rank = taxon.getAttribute("rank");
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
    const t = new Subject(`treatment:${id}`);

    const taxon: Element = document.querySelector(
      'document treatment subSubSection[type="nomenclature"] taxonomicName',
    ); // existence asserted by checkForErrors

    const epithetErrors = checkForEpithetErrors(taxon);
    if (epithetErrors.length) {
      epithetErrors.forEach((e) => {
        t.addProperty("# Warning: Could not add treatment taxon because", e);
        log(`Warning: Could not add treatment taxon because ${e}`);
      });
    } else {
      const rank: string = taxon.getAttribute("rank");
      const taxonStatus: string = taxon.getAttribute("status") ??
        taxon.parentNode.querySelector(
          `taxonomicName ~ taxonomicNameLabel[rank="${rank}"]`,
        )?.innerText ?? "ABSENT";

      const taxonConcept = makeTaxonConcept(taxon, taxon);

      // add reference to subject taxon concept, using taxon name as a fallback if we're lacking a valid authority
      if (!taxonConcept.ok) {
        // no valid authority given, fall back to taxon name
        t.addProperty("trt:treatsTaxonName", taxonNameURI(taxon));
      } else {
        // we have a valid authority, go for the taxon stringconcept
        if (taxonStatus === "nomen dubium") {
          t.addProperty(`trt:deprecates`, taxonConcept.uri);
        } else if (
          taxonStatus !== "ABSENT" ||
          taxon.parentNode.querySelector(`taxonomicName ~ taxonomicNameLabel`)
        ) {
          t.addProperty(`trt:definesTaxonConcept`, taxonConcept.uri);
        } else {
          t.addProperty(`trt:augmentsTaxonConcept`, taxonConcept.uri);
        }
      }

      makeTaxonName(taxon);
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
      if (cTaxon) addTaxonConceptCitation(t, taxon, cTaxon);
      else {
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
   * - uri: uri of taxon-concept or taxon-name if invalid authority
   */
  function makeTaxonConcept(
    taxon: Element,
    cTaxon: Element,
  ): { ok: boolean; uri: string } {
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

    if (cTaxonAuthority === "INVALID") {
      const uri = taxonNameURI(cTaxon);
      log(`Warning: Invalid Authority for ${uri}`);
      return { ok: false, uri };
    }

    const uri = taxonConceptURI({
      taxonName: cTaxon,
      taxonAuthority: cTaxonAuthority,
    });

    const prev = taxonConcepts.find((t) => t.uri === uri);
    const s = prev || new Subject(uri);
    if (!prev) taxonConcepts.push(s);

    // check required attributes
    if (
      cTaxonRankGroup === RANKS.INVALID ||
      taxonRelation === REL.NONE
    ) {
      if (cTaxonRankGroup === RANKS.INVALID) {
        s.addProperty("# Error:", "Invalid Rank");
      }
      if (taxonRelation === REL.NONE) {
        s.addProperty("# Error:", "Invalid taxon relation");
      }
      s.addProperty("a", "dwcFP:TaxonConcept");
      makeTaxonName(cTaxon);
      return { ok: true, uri };
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
      !n.match(/\.|authority|Authority|evidence|Evicence|lsidName/)
    ).forEach((n: string) => {
      // the xslt seems to special-case this, but output comparison suggests otherwise?
      // this is because it was only changed recently, so the change was not immediately obvious.
      // see https://github.com/plazi/gg2rdf/issues/10
      if (n === "ID-CoL") {
        s.addProperty(
          "rdfs:seeAlso",
          URI(
            `https://www.catalogueoflife.org/data/taxon/${
              normalizeSpace(taxon.getAttribute(n))
            }`,
          ),
        );
      } else {
        s.addProperty(`dwc:${n}`, STR(normalizeSpace(cTaxon.getAttribute(n))));
      }
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
    return { ok: true, uri };
  }

  /** replaces <xsl:template match="materialsCitation[@specimenCode]" mode="subject"> */
  function makeCitedMaterial(c: Element): string {
    const mcId = c.getAttribute("id");
    const httpUri = c.getAttribute("httpUri");
    const specimenCode = c.getAttribute("specimenCode");

    const uri = mcId
      ? URI(`http://tb.plazi.org/GgServer/dwcaRecords/${id}.mc.${mcId}`)
      : (httpUri ? URI(httpUri) : URI(
        `http://treatment.plazi.org/id/${id}/${partialURI(specimenCode)}`,
        "_",
      ));

    if (!mcId && !httpUri && !specimenCode) {
      output(
        "# Warning: Failed to output a material citation, could not create identifier",
      );
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
    taxon: Element,
    cTaxon: Element,
  ): void {
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
    ) {
      if (cTaxonAuthority === "INVALID") {
        t.addProperty(
          "# Warning",
          `Not adding 'trt:citesTaxonName ${
            taxonNameURI(cTaxon)
          }' due to issues with rank`,
        );
      } else {t.addProperty(
          "# Warning",
          `Not adding 'trt:citesTaxonName ${
            taxonConceptURI({
              taxonName: cTaxon,
              taxonAuthority: cTaxonAuthority,
            })
          }' due to issues with rank`,
        );}
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
      const taxonConcept = makeTaxonConcept(taxon, cTaxon);
      if (taxonConcept.ok) {
        t.addProperty(`cito:cites`, taxonConcept.uri);
      } else {
        t.addProperty(`trt:citesTaxonName`, taxonNameURI(cTaxon));
      }
      return;
    }
    // do not let a taxon deprecate itself
    // skip taxon names with insufficient attributes
    if (taxonRelation === REL.SAME || taxonRelation === REL.NONE) return;
    // deprecate recombined, renamed, and synonymized names
    const taxonConcept = makeTaxonConcept(taxon, cTaxon);
    if (taxonConcept.ok) {
      t.addProperty(`trt:deprecates`, taxonConcept.uri);
    } else {
      t.addProperty(`trt:citesTaxonName`, taxonNameURI(cTaxon));
    }
    return;
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

  /** replaces <xsl:call-template name="authority"> */
  function getAuthority(
    { taxonName, taxonStatus }: { taxonName: Element; taxonStatus: string },
  ) {
    const baseAuthorityName: string = taxonName.getAttribute(
      "baseAuthorityName",
    );
    const baseAuthorityYear: string = taxonName.getAttribute(
      "baseAuthorityYear",
    );
    const authorityName: string = taxonName.getAttribute("authorityName");
    const authorityYear: string = taxonName.getAttribute("authorityYear");
    let docAuthor: string = doc.getAttribute("docAuthor");
    let docDate: string = doc.getAttribute("docDate");

    if (
      taxonStatus.includes("ABSENT") || taxonStatus.includes("comb") ||
      taxonStatus.includes("stat")
    ) {
      // in this case, don't consider docAuthor & docDate
      docAuthor = "";
      docDate = "";
    }

    const name = baseAuthorityName || authorityName || docAuthor;
    const year = baseAuthorityYear || authorityYear || docDate;
    if (name && year) {
      return `_${authorityNameForURI(name)}_${partialURI(year)}`;
    }
    return "INVALID";
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
          names.flat().filter((n) => !!n).join("_").replaceAll(".", ""),
        );
    } else {
      const sigEpithet = normalizeSpace(taxonName.getAttribute(rank));
      if (sigEpithet) {
        return "/" +
          partialURI(taxonName.getAttribute(rank).replaceAll(".", ""));
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

  /** returns plain uri
   *
   * replaces <xsl:call-template name="taxonConceptBaseURI"> */
  function taxonConceptBaseURI({ kingdom }: { kingdom: string }) {
    return `http://taxon-concept.plazi.org/id/${
      kingdom ? partialURI(kingdom) : "Animalia"
    }`;
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
      taxonConceptBaseURI({ kingdom: taxonName.getAttribute("kingdom") }) +
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

  function STR(s: string) {
    if (!s) return `""`;
    return JSON.stringify(String(s));
  }

  /** removes reserved uri characters from `s`, to be later passed to URI */
  function partialURI(s: string) {
    if (!s) return "";
    return normalizeSpace(s.replace(/[;\/\?:@&=\+\$,#]+/g, " "));
  }

  function URI(uri: string, replaceSpace = "") {
    if (!uri) return "[]"; // unique blank node
    return `<${encodeURI(uri.trim().replace(/\s+/g, replaceSpace))}>`;
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
    return s.replace(/\s+/, " ").trim();
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
