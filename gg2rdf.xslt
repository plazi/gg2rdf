<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:mods="http://www.loc.gov/mods/v3"
	xmlns:xlink="http://www.w3.org/1999/xlink"
	xmlns:bibo="http://purl.org/ontology/bibo/"
	xmlns:cito="http://purl.org/spar/cito/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:dwc="http://rs.tdwg.org/dwc/terms/"
	xmlns:dwcFP="http://filteredpush.org/ontologies/oa/dwcFP#"
	xmlns:fabio="http://purl.org/spar/fabio/"
	xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
	xmlns:trt="http://plazi.org/vocab/treatment#"
	xmlns:xs="http://www.w3.org/2001/XMLSchema/"
	exclude-result-prefixes="xs" version="1.0">
<!-- xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
	xmlns:xs="http://www.w3.org/2001/XMLSchema/"
	
	NAMESPACES USED ONLY IN INPUT XMLS
	xmlns:mods="http://www.loc.gov/mods/v3"
	xmlns:xlink="http://www.w3.org/1999/xlink"
	
	NAMESPACES USED ONLY IN OUTPUT RDF-XMLS
	xmlns:bibo="http://purl.org/ontology/bibo/"
	xmlns:cito="http://purl.org/spar/cito/"
	xmlns:cnt="http://www.w3.org/2011/content#"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:dwc="http://rs.tdwg.org/dwc/terms/"
	xmlns:dwcFP="http://filteredpush.org/ontologies/oa/dwcFP#"
	xmlns:fabio="http://purl.org/spar/fabio/"
	xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
	xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
	xmlns:sdd="http://tdwg.org/sdd#"
	xmlns:trt="http://plazi.org/vocab/treatment#"
	xmlns:sdo="http://schema.org/"
	exclude-result-prefixes="xs" version="1.1" -->
	<xsl:output encoding="UTF-8" indent="yes" method="xml" media-type="application/rdf+xml"/>
	
	<!-- outputs source taxonomicName annotations and template name if set to 'yes' -->
	<xsl:variable name="showSource">no</xsl:variable>
	
	<xsl:template match="/">
		
		<!-- compute treatment taxon for pre-checks -->
		<xsl:variable name="taxonAll" select=".//document//treatment//subSubSection[./@type = 'nomenclature'][1]//taxonomicName[1]"/>
		<xsl:variable name="taxon" select="$taxonAll[1]"/>
		
		<!-- produce RDF XML -->
		<rdf:RDF>
			
			<!-- get significant epithet -->
			<xsl:variable name="sigEpithet"><xsl:value-of select="$taxon/@*[name(.) = $taxon/@rank]"/></xsl:variable>
			
			<!-- TODO catch URI breaking errors (string length 0 after removing all permitted characters evaluated to false) -->
			<xsl:variable name="taxonError"><xsl:choose>
				<xsl:when test="not($taxon)">- the treatment is lacking the taxon</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="rankError"><xsl:choose>
				<xsl:when test="not($taxon/@rank)">- the treatment taxon is lacking its rank attribute</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="sigEpithetError"><xsl:choose>
				<xsl:when test="translate(normalize-space($sigEpithet), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- <xsl:value-of select="$taxon/@rank"/> '<xsl:value-of select="$sigEpithet"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="speciesError"><xsl:choose>
				<xsl:when test="($taxon/@rank = 'subSpecies' or $taxon/@tank = 'variety') and translate(normalize-space($taxon/@species), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- species '<xsl:value-of select="$taxon/@species"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="genusError"><xsl:choose>
				<xsl:when test="($taxon/@rank = 'subGenus' or $taxon/@rank = 'species' or $taxon/@rank = 'subSpecies' or $taxon/@rank = 'variety') and translate(normalize-space($taxon/@genus), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- genus '<xsl:value-of select="$taxon/@genus"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="familyError"><xsl:choose>
				<xsl:when test="($taxon/@rank = 'subFamily' or $taxon/@rank = 'tribe' or $taxon/@rank = 'subTribe') and translate(normalize-space($taxon/@family), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- family '<xsl:value-of select="$taxon/@family"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="orderError"><xsl:choose>
				<xsl:when test="$taxon/@rank = 'subOrder' and translate(normalize-space($taxon/@order), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- order '<xsl:value-of select="$taxon/@order"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="classError"><xsl:choose>
				<xsl:when test="$taxon/@rank = 'subClass' and translate(normalize-space($taxon/@class), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- class '<xsl:value-of select="$taxon/@class"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			<xsl:variable name="phylumError"><xsl:choose>
				<xsl:when test="$taxon/@rank = 'subPhylum' and translate(normalize-space($taxon/@phylum), 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-', '')">- phylum '<xsl:value-of select="$taxon/@phylum"/>' contains invalid characters</xsl:when>
				<xsl:otherwise></xsl:otherwise>
			</xsl:choose></xsl:variable>
			
			<!-- produce actual content, or error message -->
			<xsl:choose>
				<xsl:when test="not($taxonError = '') or not($rankError = '') or not($sigEpithetError = '') or not($speciesError = '') or not($genusError = '') or not($familyError = '') or not($orderError = '') or not($classError = '') or not($phylumError = '')">
					<!-- xsl:text disable-output-escaping="yes">&lt;! - - Cannot produce RDF XML due to data errors:</xsl:text>
					<xsl:if test="not($taxonError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$taxonError"/></xsl:if>
					<xsl:if test="not($rankError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$rankError"/></xsl:if>
					<xsl:if test="not($sigEpithetError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$sigEpithetError"/></xsl:if>
					<xsl:if test="not($speciesError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$speciesError"/></xsl:if>
					<xsl:if test="not($genusError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$genusError"/></xsl:if>
					<xsl:if test="not($familyError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$familyError"/></xsl:if>
					<xsl:if test="not($orderError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$orderError"/></xsl:if>
					<xsl:if test="not($classError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$classError"/></xsl:if>
					<xsl:if test="not($phylumError = '')"><xsl:text disable-output-escaping="yes">&#x0D;&#x0A;</xsl:text><xsl:value-of select="$phylumError"/></xsl:if>
					<xsl:text disable-output-escaping="yes">&#x0D;&#x0A; - - &gt;</xsl:text -->
					<rdf:comment>Cannot produce RDF XML due to data errors:</rdf:comment>
					<xsl:if test="not($taxonError = '')"><rdf:comment><xsl:value-of select="$taxonError"/></rdf:comment></xsl:if>
					<xsl:if test="not($rankError = '')"><rdf:comment><xsl:value-of select="$rankError"/></rdf:comment></xsl:if>
					<xsl:if test="not($sigEpithetError = '')"><rdf:comment><xsl:value-of select="$sigEpithetError"/></rdf:comment></xsl:if>
					<xsl:if test="not($speciesError = '')"><rdf:comment><xsl:value-of select="$speciesError"/></rdf:comment></xsl:if>
					<xsl:if test="not($genusError = '')"><rdf:comment><xsl:value-of select="$genusError"/></rdf:comment></xsl:if>
					<xsl:if test="not($familyError = '')"><rdf:comment><xsl:value-of select="$familyError"/></rdf:comment></xsl:if>
					<xsl:if test="not($orderError = '')"><rdf:comment><xsl:value-of select="$orderError"/></rdf:comment></xsl:if>
					<xsl:if test="not($classError = '')"><rdf:comment><xsl:value-of select="$classError"/></rdf:comment></xsl:if>
					<xsl:if test="not($phylumError = '')"><rdf:comment><xsl:value-of select="$phylumError"/></rdf:comment></xsl:if>
					
				</xsl:when>
				<xsl:otherwise>
					
					<!-- include warnign about defaulting missing kingdom -->
					<xsl:if test="not($taxon/@kingdom)"><xsl:text disable-output-escaping="yes">&lt;!-- WARNING: treatment taxon is missing ancestor kingdom, defaulting to 'Animalia' --&gt;</xsl:text></xsl:if>
					
					<!-- produce RDF descriptions -->
					<xsl:apply-templates select="//document"/>
				</xsl:otherwise>
			</xsl:choose>
		</rdf:RDF>
	</xsl:template>
	
	<xsl:template match="document">
		<xsl:apply-templates select="//treatment"/>
	</xsl:template>
	
	<xsl:template match="treatment">
		
		<!-- pre-compute treatment taxon -->
		<xsl:variable name="taxonAll" select=".//subSubSection[./@type = 'nomenclature'][1]//taxonomicName[1]"/>
		<xsl:variable name="taxon" select="$taxonAll[1]"/>
		<!-- xsl:message>GOT TAXON (<xsl:value-of select="count($taxon)"/>): <xsl:copy-of select="$taxon"/></xsl:message -->
		
		<!-- pre-compute taxon status -->
		<xsl:variable name="taxonStatus"><xsl:choose>
			<xsl:when test="$taxon/@status"><xsl:value-of select="$taxon/@status"/></xsl:when>
			<xsl:when test="$taxon/following-sibling::taxonomicNameLabel[./@rank = $taxon/@rank]"><xsl:value-of select="$taxon/following-sibling::taxonomicNameLabel[./@rank = $taxon/@rank]"/></xsl:when>
			<xsl:otherwise>ABSENT</xsl:otherwise>
		</xsl:choose></xsl:variable>
		
		<!-- pre-compute authority -->
		<xsl:variable name="taxonAuthority"><xsl:call-template name="authority">
			<xsl:with-param name="taxonName" select="$taxon"/>
			<xsl:with-param name="taxonStatus" select="$taxonStatus"/>
		</xsl:call-template></xsl:variable>
		
		<!-- about treatment proper -->
		<rdf:Description>
			<xsl:attribute name="rdf:about">http://treatment.plazi.org/id/<xsl:value-of select="./ancestor::document/@docId"/></xsl:attribute>
			<rdf:type rdf:resource="http://plazi.org/vocab/treatment#Treatment"/>
			
			<!-- add reference to subject taxon concept, using taxon name as a fallback if we're lacking a valid authority -->
			<xsl:choose>
				<!-- no valid authority given, fall back to taxon name -->
				<xsl:when test="$taxonAuthority = 'INVALID'"><xsl:element name="trt:treatsTaxonName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="taxonName" select="$taxon"/>
				</xsl:call-template>/<xsl:call-template name="taxonNameForURI">
					<xsl:with-param name="taxonName" select="$taxon"/>
				</xsl:call-template></xsl:attribute></xsl:element></xsl:when>
				
				<!-- we have a valid authority, go for the taxon concept -->
				<xsl:otherwise><xsl:choose>
					<xsl:when test="not($taxonStatus = 'ABSENT')"><xsl:element name="trt:definesTaxonConcept"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonConceptURI">
						<xsl:with-param name="taxonName" select="$taxon"/>
						<xsl:with-param name="taxonAuthority" select="$taxonAuthority"/>
					</xsl:call-template></xsl:attribute></xsl:element></xsl:when>
					<xsl:when test="$taxon/following-sibling::taxonomicNameLabel"><xsl:element name="trt:definesTaxonConcept"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonConceptURI">
						<xsl:with-param name="taxonName" select="$taxon"/>
						<xsl:with-param name="taxonAuthority" select="$taxonAuthority"/>
					</xsl:call-template></xsl:attribute></xsl:element></xsl:when>
					<xsl:otherwise><xsl:element name="trt:augmentsTaxonConcept"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonConceptURI">
						<xsl:with-param name="taxonName" select="$taxon"/>
						<xsl:with-param name="taxonAuthority" select="$taxonAuthority"/>
					</xsl:call-template></xsl:attribute></xsl:element></xsl:otherwise>
				</xsl:choose></xsl:otherwise>
			</xsl:choose>
			
			<!-- add authors (_might_ differ from article author ...) -->
			<xsl:apply-templates select="//mods:mods/mods:name[mods:role/mods:roleTerm/text() = 'Author']"/>
			
			<!-- add reference to parent publication -->
			<xsl:element name="trt:publishedIn"><xsl:attribute name="rdf:resource"><xsl:call-template name="escapeDoi"><xsl:with-param name="doi"><xsl:choose>
				<xsl:when test="contains(./ancestor::document/@ID-DOI, 'doi.org/10.')">
					<xsl:value-of select="translate(normalize-space(./ancestor::document/@ID-DOI), ' ', '')"/>
				</xsl:when>
				<xsl:when test="contains(./ancestor::document/@docSource, 'doi.org/10.')">
					<xsl:value-of select="translate(normalize-space(./ancestor::document/@docSource), ' ', '')"/>
				</xsl:when>
				<xsl:when test="./ancestor::document/@ID-DOI">
					<xsl:text>http://dx.doi.org/</xsl:text><xsl:value-of select="translate(normalize-space(./ancestor::document/@ID-DOI), ' ', '')"/>
				</xsl:when>
				<xsl:otherwise>
					<xsl:value-of select="'http://publication.plazi.org/id/'"/><xsl:value-of select="./ancestor::document/@masterDocId"/>
				</xsl:otherwise>
			</xsl:choose></xsl:with-param></xsl:call-template></xsl:attribute></xsl:element>
			
			<!-- add cited taxon concepts -->
			<xsl:for-each select=".//subSubSection[./@type = 'reference_group']//treatmentCitationGroup">
				<!-- store cited taxon name -->
				<xsl:variable name="cTaxonAll" select=".//taxonomicName"/>
				<xsl:variable name="cTaxon" select="$cTaxonAll[1]"/>
				
				<!-- create citation -->
				<xsl:call-template name="taxonConceptCitation">
					<xsl:with-param name="taxon" select="$taxon"/>
					<xsl:with-param name="cTaxon" select="$cTaxon"/>
				</xsl:call-template>
			</xsl:for-each>
			<xsl:for-each select=".//subSubSection[./@type = 'reference_group']//treatmentCitation[not(./ancestor::treatmentCitationGroup)]">
				<!-- store cited taxon name -->
				<xsl:variable name="cTaxonAll" select=".//taxonomicName"/>
				<xsl:variable name="cTaxon" select="$cTaxonAll[1]"/>
				
				<!-- create citation -->
				<xsl:call-template name="taxonConceptCitation">
					<xsl:with-param name="taxon" select="$taxon"/>
					<xsl:with-param name="cTaxon" select="$cTaxon"/>
				</xsl:call-template>
			</xsl:for-each>
			<xsl:for-each select=".//subSubSection[./@type = 'reference_group']//taxonomicName[not(./ancestor::treatmentCitation) and not(./ancestor::treatmentCitationGroup)]">
				<!-- store cited taxon name -->
				<xsl:variable name="cTaxon" select="."/>
				
				<!-- create citation -->
				<xsl:call-template name="taxonConceptCitation">
					<xsl:with-param name="taxon" select="$taxon"/>
					<xsl:with-param name="cTaxon" select="$cTaxon"/>
				</xsl:call-template>
			</xsl:for-each>
			
			
			
			<!-- TODO maybe add references to materials citations that have a specimen (HTTP) URI -->
			<!--xsl:apply-templates select="//materialsCitation" mode="object">
				<xsl:with-param name="treatmentID" select="concat('http://treatment.plazi.org/id/', ./ancestor::document/@docId)"/>
			</xsl:apply-templates-->
			<!--xsl:apply-templates select="//figureCitation[@httpUri]" mode="object"/-->
			<xsl:apply-templates select="//figureCitation[./@httpUri and not(./@httpUri = ./preceding::figureCitation/@httpUri)]" mode="treatmentObject"/>
		</rdf:Description>
		<!-- xsl:message>TREATMENT DONE</xsl:message -->
		
		<!-- entities referenced from treatment -->
		<xsl:call-template name="publication">
			<xsl:with-param name="pubID"><xsl:choose>
				<xsl:when test="contains(./ancestor::document/@ID-DOI, 'doi.org/')">
					<xsl:value-of select="translate(normalize-space(./ancestor::document/@ID-DOI), ' ', '')"/>
				</xsl:when>
				<xsl:when test="./ancestor::document/@ID-DOI">
					<xsl:text>http://dx.doi.org/</xsl:text><xsl:value-of select="translate(normalize-space(./ancestor::document/@ID-DOI), ' ', '')"/>
				</xsl:when>
				<xsl:when test="contains(./ancestor::document/@docSource, 'dx.doi')">
					<xsl:value-of select="translate(normalize-space(./ancestor::document/@docSource), ' ', '')"/>
				</xsl:when>
				<xsl:otherwise>
					<xsl:value-of select="'http://publication.plazi.org/id/'"/><xsl:value-of select="./ancestor::document/@masterDocId"/>
				</xsl:otherwise>
			</xsl:choose></xsl:with-param>
		</xsl:call-template>
		<!-- xsl:message>PUBLICATION DONE</xsl:message -->
		
		<!-- xsl:apply-templates select=".//treatmentCitation[./@httpUri]" mode="subject"/ -->
		<!-- xsl:message>TREATMENT CITATIONS DONE</xsl:message -->
		
		<!-- add taxon concept if we have a valid authority -->
		<xsl:if test="$taxonAuthority != 'INVALID'"><rdf:Description>
			<xsl:attribute name="rdf:about"><xsl:call-template name="taxonConceptURI">
				<xsl:with-param name="taxonName" select="$taxon"/>
				<xsl:with-param name="taxonAuthority" select="$taxonAuthority"/>
			</xsl:call-template></xsl:attribute>
			<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonConcept"/>
			<xsl:call-template name="taxonNameDetails">
				<xsl:with-param name="taxonName" select="$taxon"/>
			</xsl:call-template>
			<xsl:if test="$taxon/@authority"><xsl:element name="dwc:scientificNameAuthorship"><xsl:value-of select="normalize-space($taxon/@authority)"/></xsl:element></xsl:if>
			<!-- TODO_not also use pre-computed authority here USE VERBATIM AUTHORITY HERE, THE URI VERSION OVER-SIMPLIFIES -->
			
			<xsl:if test="not($taxon/@authority)">
				<xsl:element name="dwc:authority"><xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxon/ancestor::document/@docAuthor"/>
				</xsl:call-template>, <xsl:value-of select="$taxon/ancestor::document/@docDate"/></xsl:element>
				<xsl:element name="dwc:authorityName"><xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxon/ancestor::document/@docAuthor"/>
				</xsl:call-template></xsl:element>
				<xsl:element name="dwc:authorityYear"><xsl:value-of select="$taxon/ancestor::document/@docDate"/></xsl:element>
			</xsl:if>
			<xsl:element name="trt:hasTaxonName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameURI">
				<xsl:with-param name="taxonName" select="$taxon"/>
			</xsl:call-template></xsl:attribute></xsl:element>
			<xsl:if test="$showSource = 'yes'"><source via="treatmentTaxon"><xsl:copy-of select="$taxon"/></source></xsl:if>
		</rdf:Description></xsl:if>
		<!-- xsl:message>TAXON CONCEPT DONE</xsl:message -->
		
		<xsl:call-template name="taxonName">
			<xsl:with-param name="taxonName" select="$taxon"/>
		</xsl:call-template>
		<!-- xsl:message>TAXON NAME DONE</xsl:message -->
		
		<xsl:for-each select=".//subSubSection[./@type = 'reference_group']//treatmentCitationGroup">
			<xsl:variable name="cTaxonAll" select=".//taxonomicName"/>
			<xsl:variable name="cTaxon" select="$cTaxonAll[1]"/>
			<xsl:call-template name="citedTaxonConcept">
				<xsl:with-param name="taxon" select="$taxon"/>
				<xsl:with-param name="cTaxon" select="$cTaxon"/>
			</xsl:call-template>
		</xsl:for-each>
		<xsl:for-each select=".//subSubSection[./@type = 'reference_group']//treatmentCitation[not(./ancestor::treatmentCitationGroup)]">
			<xsl:variable name="cTaxonAll" select=".//taxonomicName"/>
			<xsl:variable name="cTaxon" select="$cTaxonAll[1]"/>
			<xsl:call-template name="citedTaxonConcept">
				<xsl:with-param name="taxon" select="$taxon"/>
				<xsl:with-param name="cTaxon" select="$cTaxon"/>
			</xsl:call-template>
		</xsl:for-each>
		<xsl:for-each select=".//subSubSection[./@type = 'reference_group']//taxonomicName[not(./ancestor::treatmentCitation) and not(./ancestor::treatmentCitationGroup)]">
			<xsl:variable name="cTaxon" select="."/>
			<xsl:call-template name="citedTaxonConcept">
				<xsl:with-param name="taxon" select="$taxon"/>
				<xsl:with-param name="cTaxon" select="$cTaxon"/>
			</xsl:call-template>
		</xsl:for-each>
		
		
		
		<!-- xsl:message>TAXON CONCEPT CITATIONS DONE</xsl:message -->
		
		<!-- TODO maybe add references to materials citations that have a specimen (HTTP) URI -->
		<!--xsl:apply-templates select=".//materialsCitation" mode="subject">
			<xsl:with-param name="treatmentID" select="concat('http://treatment.plazi.org/id/', ./ancestor::document/@docId)"/>
		</xsl:apply-templates-->
		
		<!--xsl:apply-templates select=".//figureCitation[@httpUri]" mode="subject"/-->
		<xsl:apply-templates select="//figureCitation[./@httpUri and not(./@httpUri = ./preceding::figureCitation/@httpUri)]" mode="subject"/>
		<!-- xsl:message>FIGURE CITATIONS DONE</xsl:message -->
	</xsl:template>
	
	<xsl:template name="taxonConceptCitation">
		<xsl:param name="taxon"/>
		<xsl:param name="cTaxon"/>
		
		<!-- pre-compute authority -->
		<xsl:variable name="cTaxonAuthority"><xsl:call-template name="authority">
			<xsl:with-param name="taxonName" select="$cTaxon"/>
			<xsl:with-param name="taxonStatus">ABSENT</xsl:with-param>
		</xsl:call-template></xsl:variable>
		
		<!-- determine relationship -->
		<xsl:variable name="taxonRelation"><xsl:call-template name="taxonRelation">
			<xsl:with-param name="taxon" select="$taxon"/>
			<xsl:with-param name="cTaxon" select="$cTaxon"/>
		</xsl:call-template></xsl:variable>
		
		<!-- determine rank group -->
		<xsl:variable name="cTaxonRankGroup"><xsl:choose>
			<xsl:when test="$cTaxon/@species">species</xsl:when>
			<xsl:when test="$cTaxon/@genus">genus</xsl:when>
			<xsl:when test="$cTaxon/@tribe">tribe</xsl:when>
			<xsl:when test="$cTaxon/@family">family</xsl:when>
			<xsl:when test="$cTaxon/@order">order</xsl:when>
			<xsl:when test="$cTaxon/@class">class</xsl:when>
			<xsl:when test="$cTaxon/@phylum">phylum</xsl:when>
			<xsl:when test="$cTaxon/@kingdom">kingdom</xsl:when>
			<xsl:otherwise>INVALID</xsl:otherwise>
		</xsl:choose></xsl:variable>
		
		<!-- add statement -->
		<xsl:choose>
			<!-- check required attributes -->
			<xsl:when test="not($cTaxon/@kingdom)"/>
			<xsl:when test="$cTaxonRankGroup = 'INVALID'"/>
			<xsl:when test="$cTaxonRankGroup = 'species' and not($cTaxon/@genus)"/>
			<!-- no valid authority cited, fall back to taxon name -->
			<xsl:when test="$cTaxonAuthority = 'INVALID'"><xsl:element name="trt:citesTaxonName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameForURI">
				<xsl:with-param name="taxonName" select="$cTaxon"/>
			</xsl:call-template></xsl:attribute></xsl:element></xsl:when>
			<!-- do not let a citing treatment deprecate a cited name -->
			<xsl:when test="$taxonRelation = 'CITES'"><xsl:element name="cito:cites"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonConceptURI">
				<xsl:with-param name="taxonName" select="$cTaxon"/>
				<xsl:with-param name="taxonAuthority" select="$cTaxonAuthority"/>
			</xsl:call-template></xsl:attribute></xsl:element></xsl:when>
			<!-- do not let a taxon deprecate itself -->
			<xsl:when test="$taxonRelation = 'SAME'"/>
			<!-- skip taxon names with insufficient attributes -->
			<xsl:when test="$taxonRelation = 'NONE'"/>
			<!-- deprecate recombined, renamed, and synonymized names -->
			<xsl:otherwise><xsl:element name="trt:deprecates"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonConceptURI">
				<xsl:with-param name="taxonName" select="$cTaxon"/>
				<xsl:with-param name="taxonAuthority" select="$cTaxonAuthority"/>
			</xsl:call-template></xsl:attribute></xsl:element></xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="citedTaxonConcept">
		<xsl:param name="taxon"/>
		<xsl:param name="cTaxon"/>
		
		<!-- pre-compute authority -->
		<xsl:variable name="cTaxonAuthority"><xsl:call-template name="authority">
			<xsl:with-param name="taxonName" select="$cTaxon"/>
			<xsl:with-param name="taxonStatus">ABSENT</xsl:with-param>
		</xsl:call-template></xsl:variable>
		
		<!-- determine relationship -->
		<xsl:variable name="taxonRelation"><xsl:call-template name="taxonRelation">
			<xsl:with-param name="taxon" select="$taxon"/>
			<xsl:with-param name="cTaxon" select="$cTaxon"/>
		</xsl:call-template></xsl:variable>
		
		<!-- determine rank group -->
		<xsl:variable name="cTaxonRankGroup"><xsl:choose>
			<xsl:when test="$cTaxon/@species">species</xsl:when>
			<xsl:when test="$cTaxon/@genus">genus</xsl:when>
			<xsl:when test="$cTaxon/@tribe">tribe</xsl:when>
			<xsl:when test="$cTaxon/@family">family</xsl:when>
			<xsl:when test="$cTaxon/@order">order</xsl:when>
			<xsl:when test="$cTaxon/@class">class</xsl:when>
			<xsl:when test="$cTaxon/@phylum">phylum</xsl:when>
			<xsl:when test="$cTaxon/@kingdom">kingdom</xsl:when>
			<xsl:otherwise>INVALID</xsl:otherwise>
		</xsl:choose></xsl:variable>
		
		<!-- add cited taxon concept -->
		<xsl:choose>
			<!-- check required attributes -->
			<xsl:when test="not($cTaxon/@kingdom)"/>
			<xsl:when test="$cTaxonRankGroup = 'INVALID'"/>
			<xsl:when test="$cTaxonRankGroup = 'species' and not($cTaxon/@genus)"/>
			<!-- no valid authority cited, fall back to taxon name -->
			<xsl:when test="$cTaxonAuthority = 'INVALID'"/>
			<xsl:when test="$taxonRelation = 'SAME'"/>
			<!-- do not output the same taxon twice -->
			<xsl:when test="$taxonRelation = 'SAME'"/>
			<!-- skip taxon names with insufficient attributes -->
			<xsl:when test="$taxonRelation = 'NONE'"/>
			<!-- cannot filter duplicates this way, no guarantee that predecessor outputs
			<xsl:when test="$cTaxon/preceding::taxonomicName[./@rank = $cTaxon/@rank and ./@genus = $cTaxon/@genus and ./@species = $cTaxon/@species and ./@authorityYear = $cTaxon/@authorityYear and ./@authorityName = $cTaxon/@authorityName]"></xsl:when>
			<xsl:when test="$cTaxon/preceding::taxonomicName[./@rank = $cTaxon/@rank and ./@genus = $cTaxon/@genus and ./@species = $cTaxon/@species and ./@baseAuthorityYear = $cTaxon/@baseAuthorityYear and ./@baseAuthorityName = $cTaxon/@baseAuthorityName]"></xsl:when>
			-->
			<!-- create statements (for both citations and deprecations) -->
			<xsl:otherwise>
				<rdf:Description>
					<xsl:attribute name="rdf:about"><xsl:call-template name="taxonConceptURI">
						<xsl:with-param name="taxonName" select="$cTaxon"/>
						<xsl:with-param name="taxonAuthority" select="$cTaxonAuthority"/>
					</xsl:call-template></xsl:attribute>
					<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonConcept"/>
					<xsl:call-template name="taxonNameDetails">
						<xsl:with-param name="taxonName" select="$cTaxon"/>
					</xsl:call-template>
					<xsl:element name="trt:hasTaxonName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameURI">
						<xsl:with-param name="taxonName" select="$cTaxon"/>
					</xsl:call-template></xsl:attribute></xsl:element>
					<xsl:choose>
						<xsl:when test="$cTaxon/@authority"><xsl:element name="dwc:scientificNameAuthorship"><xsl:value-of select="normalize-space($cTaxon/@authority)"/></xsl:element></xsl:when>
						<xsl:when test="$cTaxon/@baseAuthorityName and $cTaxon/@baseAuthorityYear"><xsl:element name="dwc:scientificNameAuthorship"><xsl:value-of select="normalize-space($cTaxon/@baseAuthorityName)"/>, <xsl:value-of select="$cTaxon/@baseAuthorityYear"/></xsl:element></xsl:when>
						<xsl:when test="$cTaxon/@authorityName and $cTaxon/@authorityYear"><xsl:element name="dwc:scientificNameAuthorship"><xsl:value-of select="normalize-space($cTaxon/@authorityName)"/>, <xsl:value-of select="$cTaxon/@authorityYear"/></xsl:element></xsl:when>
					</xsl:choose>
					<xsl:if test="$showSource = 'yes'"><source via="citedTaxonConcept"><xsl:copy-of select="$cTaxon"/></source></xsl:if>
				</rdf:Description>
				<xsl:call-template name="taxonName">
					<xsl:with-param name="taxonName" select="$cTaxon"/>
				</xsl:call-template>
			</xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="authority">
		<xsl:param name="taxonName"/>
		<xsl:param name="taxonStatus"/>
		<xsl:choose>
			<!-- no status at all, use whichever authority given (basionym authority first, as it tends to be cited for a reason under ICZN code) -->
			<xsl:when test="contains($taxonStatus, 'ABSENT')"><xsl:choose>
				<xsl:when test="$taxonName/@baseAuthorityName and $taxonName/@baseAuthorityYear">_<xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxonName/@baseAuthorityName"/>
				</xsl:call-template>_<xsl:value-of select="$taxonName/@baseAuthorityYear"/></xsl:when>
				<xsl:when test="$taxonName/@authorityName and $taxonName/@authorityYear">_<xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxonName/@authorityName"/>
				</xsl:call-template>_<xsl:value-of select="$taxonName/@authorityYear"/></xsl:when>
				<xsl:otherwise>INVALID</xsl:otherwise>
			</xsl:choose></xsl:when>
			<!-- newly minted replacement name for homonym or Latin grammar error, use combination or document authority -->
			<xsl:when test="contains($taxonStatus, 'nom') or contains($taxonStatus, 'name')"><xsl:choose>
				<xsl:when test="$taxonName/@authorityName">_<xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxonName/@authorityName"/>
				</xsl:call-template>_<xsl:value-of select="$taxonName/ancestor::document/@docDate"/></xsl:when>
				<xsl:otherwise>_<xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxonName/ancestor::document/@docAuthor"/>
				</xsl:call-template>_<xsl:value-of select="$taxonName/ancestor::document/@docDate"/></xsl:otherwise>
			</xsl:choose></xsl:when>
			<!-- new combination or status of existing epithet, use basionym authority (as that is what will be the most cited under ICZN code) -->
			<xsl:when test="contains($taxonStatus, 'comb') or contains($taxonStatus, 'stat')"><xsl:choose>
				<xsl:when test="$taxonName/@baseAuthorityName and $taxonName/@baseAuthorityYear">_<xsl:call-template name="authorityNameForURI">
					<xsl:with-param name="authorityName" select="$taxonName/@baseAuthorityName"/>
				</xsl:call-template>_<xsl:value-of select="$taxonName/@baseAuthorityYear"/></xsl:when>
				<xsl:otherwise>INVALID</xsl:otherwise>
			</xsl:choose></xsl:when>
			<!-- newly minted taxon name, use document metadata if explicit attributes missing -->
			<xsl:when test="$taxonName/@authorityName and $taxonName/@authorityYear">_<xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="$taxonName/@authorityName"/>
			</xsl:call-template>_<xsl:value-of select="$taxonName/@authorityYear"/></xsl:when>
			<xsl:when test="$taxonName/@authorityName">_<xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="$taxonName/@authorityName"/>
			</xsl:call-template>_<xsl:value-of select="$taxonName/ancestor::document/@docDate"/></xsl:when>
			<!-- newly minted taxon name, use document metadata if explicit attributes missing -->
			<xsl:otherwise>_<xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="$taxonName/ancestor::document/@docAuthor"/>
			</xsl:call-template>_<xsl:value-of select="$taxonName/ancestor::document/@docDate"/></xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="taxonRelation">
		<xsl:param name="taxon"/>
		<xsl:param name="cTaxon"/>
		
		<!-- check if authorities match -->
		<xsl:variable name="authorityMatch"><xsl:choose>
			<xsl:when test="$cTaxon/@authorityYear = $taxon/@authorityYear and $cTaxon/@authorityName = $taxon/@authorityName">MATCH</xsl:when>
			<xsl:when test="$cTaxon/@baseAuthorityYear = $taxon/@baseAuthorityYear and $cTaxon/@baseAuthorityName = $taxon/@baseAuthorityName">MATCH</xsl:when>
			<xsl:otherwise/>
		</xsl:choose></xsl:variable>
		
		<!-- determine rank groups -->
		<xsl:variable name="taxonRankGroup"><xsl:choose>
			<xsl:when test="$taxon/@species">species</xsl:when>
			<xsl:when test="$taxon/@genus">genus</xsl:when>
			<xsl:when test="$taxon/@tribe">tribe</xsl:when>
			<xsl:when test="$taxon/@family">family</xsl:when>
			<xsl:when test="$taxon/@order">order</xsl:when>
			<xsl:when test="$taxon/@class">class</xsl:when>
			<xsl:when test="$taxon/@phylum">phylum</xsl:when>
			<xsl:when test="$taxon/@kingdom">kingdom</xsl:when>
			<xsl:otherwise>INVALID</xsl:otherwise>
		</xsl:choose></xsl:variable>
		<xsl:variable name="cTaxonRankGroup"><xsl:choose>
			<xsl:when test="$cTaxon/@species">species</xsl:when>
			<xsl:when test="$cTaxon/@genus">genus</xsl:when>
			<xsl:when test="$cTaxon/@tribe">tribe</xsl:when>
			<xsl:when test="$cTaxon/@family">family</xsl:when>
			<xsl:when test="$cTaxon/@order">order</xsl:when>
			<xsl:when test="$cTaxon/@class">class</xsl:when>
			<xsl:when test="$cTaxon/@phylum">phylum</xsl:when>
			<xsl:when test="$cTaxon/@kingdom">kingdom</xsl:when>
			<xsl:otherwise>INVALID</xsl:otherwise>
		</xsl:choose></xsl:variable>
		
		<!-- determine relationship -->
		<xsl:choose>
			<!-- don't let taxon with invalid rank deprecate any other taxon -->
			<xsl:when test="$taxonRankGroup = 'INVALID'">NONE</xsl:when>
			
			<!-- catch cited taxon with invalid rank -->
			<xsl:when test="$cTaxonRankGroup = 'INVALID'">NONE</xsl:when>
			
			<!-- make sure to not deprecate across rank groups -->
			<xsl:when test="not($taxonRankGroup = $cTaxonRankGroup)">CITES</xsl:when>
			
			<!-- exclude deprecation above genus for now -->
			<xsl:when test="not($taxon/@genus) or not($cTaxon/@genus)">CITES</xsl:when>
			
			<!-- make sure to not deprecate own parent genus (subGenus is same rank group) -->
			<xsl:when test="$cTaxon/@rank = 'genus' and not($taxon/@rank = 'genus') and $cTaxon/@genus = $taxon/@genus">CITES</xsl:when>
			
			<!-- make sure to not deprecate own parent species (subSpecies and variety are same rank group) -->
			<xsl:when test="$cTaxon/@rank = 'species' and not($taxon/@rank = 'species') and $cTaxon/@genus = $taxon/@genus and $cTaxon/@species = $taxon/@species">CITES</xsl:when>
			<xsl:when test="$cTaxon/@rank = 'species' and not($taxon/@rank = 'species') and $cTaxon/@genus = $taxon/@genus and $cTaxon/@species = $taxon/@species">CITES</xsl:when>
			
			<!-- catch genuine citations of previous treatments -->
			<xsl:when test="$cTaxon/@rank = 'genus' and $cTaxon/@rank = 'genus' and $cTaxon/@genus = $taxon/@genus and $authorityMatch = 'MATCH'">SAME</xsl:when>
			<xsl:when test="$cTaxon/@rank = 'subGenus' and $cTaxon/@rank = 'subGenus' and $cTaxon/@genus = $taxon/@genus and $cTaxon/@subGenus = $taxon/@subGenus and $authorityMatch = 'MATCH'">SAME</xsl:when>
			<xsl:when test="$cTaxon/@rank = 'species' and $cTaxon/@rank = 'species' and $cTaxon/@genus = $taxon/@genus and $cTaxon/@species = $taxon/@species and $authorityMatch = 'MATCH'">SAME</xsl:when>
			<xsl:when test="$cTaxon/@rank = 'subSpecies' and $cTaxon/@rank = 'subSpecies' and $cTaxon/@genus = $taxon/@genus and $cTaxon/@species = $taxon/@species and $cTaxon/@subSpecies = $taxon/@subSpecies and $authorityMatch = 'MATCH'">SAME</xsl:when>
			<xsl:when test="$cTaxon/@rank = 'variety' and $cTaxon/@rank = 'variety' and $cTaxon/@genus = $taxon/@genus and $cTaxon/@species = $taxon/@species and $cTaxon/@variety = $taxon/@variety and $authorityMatch = 'MATCH'">SAME</xsl:when>
			
			<!-- deprecate recombined, renamed, and synonymized names -->
			<xsl:otherwise>DEPRECATES</xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="taxonConceptBaseURI">
		<xsl:param name="kingdom"/>
		<xsl:choose>
			<xsl:when test="$kingdom">http://taxon-concept.plazi.org/id/<xsl:value-of select="translate(normalize-space($kingdom), ' ', '_')"/></xsl:when>
			<xsl:otherwise>http://taxon-concept.plazi.org/id/Animalia</xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="taxonNameBaseURI">
		<xsl:param name="kingdom"/>
		<xsl:choose>
			<xsl:when test="$kingdom">http://taxon-name.plazi.org/id/<xsl:value-of select="translate(normalize-space($kingdom), ' ', '_')"/></xsl:when>
			<xsl:otherwise>http://taxon-name.plazi.org/id/Animalia</xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="authorityNameForURI">
		<xsl:param name="authorityName"/>
		<xsl:choose>
			<xsl:when test="contains($authorityName, ') ')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-after($authorityName, ') ')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, ')')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-after($authorityName, ')')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, '] ')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-after($authorityName, '] ')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, ']')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-after($authorityName, ']')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, ' &amp; ')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-before($authorityName, ' &amp; ')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, ' et al')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-before($authorityName, ' et al')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, ', ')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-before($authorityName, ', ')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, '. ')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-after($authorityName, '. ')"/>
			</xsl:call-template></xsl:when>
			<xsl:when test="contains($authorityName, ' ')"><xsl:call-template name="authorityNameForURI">
				<xsl:with-param name="authorityName" select="substring-after($authorityName, ' ')"/>
			</xsl:call-template></xsl:when>
			<xsl:otherwise><xsl:value-of select="encode-for-uri(normalize-space($authorityName))"/></xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="taxonConceptURI">
		<xsl:param name="taxonName"/>
		<xsl:param name="taxonAuthority"/>
		<!-- TODO replace fixed base URL and kingdom with template call -->
		<xsl:call-template name="taxonConceptBaseURI">
			<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
		</xsl:call-template>/<xsl:call-template name="taxonNameForURI">
			<xsl:with-param name="taxonName" select="$taxonName"/>
		</xsl:call-template><xsl:value-of select="normalize-space($taxonAuthority)"/>
	</xsl:template>
	
	<xsl:template name="taxonNameURI">
		<xsl:param name="taxonName"/>
		<!-- TODO replace fixed base URL and kingdom with template call -->
		<xsl:call-template name="taxonNameBaseURI">
			<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
		</xsl:call-template>/<xsl:call-template name="taxonNameForURI">
			<xsl:with-param name="taxonName" select="$taxonName"/>
		</xsl:call-template>
	</xsl:template>
	
	<xsl:template name="taxonNameForURI">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<!-- TODO handle subSpecies + variety -->
			<xsl:when test="$taxonName/@variety"><xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@species), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@variety), ' ', '_')"/></xsl:when>
			<xsl:when test="$taxonName/@subSpecies"><xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@species), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@subSpecies), ' ', '_')"/></xsl:when>
			<xsl:when test="$taxonName/@species"><xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@species), ' ', '_')"/></xsl:when>
			<xsl:when test="$taxonName/@subGenus"><xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@subGenus), ' ', '_')"/></xsl:when>
			<xsl:when test="$taxonName/@genus"><xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/></xsl:when>
			<xsl:when test="contains($taxonName, ',') and not(contains(normalize-space(substring-before($taxonName, ',')), ' '))"><xsl:value-of select="translate(normalize-space(substring-before($taxonName, ',')), ' ', '_')"/></xsl:when>
			<xsl:when test="contains(normalize-space($taxonName), ' ') and not(contains(substring-before(normalize-space($taxonName), ' '), ','))"><xsl:value-of select="translate(substring-before(normalize-space($taxonName), ' '), ' ', '_')"/></xsl:when>
			<xsl:when test="contains($taxonName, ',')"><xsl:value-of select="translate(normalize-space(substring-before($taxonName, ',')), ' ', '_')"/></xsl:when>
			<xsl:when test="contains(normalize-space($taxonName), ' ')"><xsl:value-of select="translate(substring-before(normalize-space($taxonName), ' '), ' ', '_')"/></xsl:when>
			<xsl:otherwise><xsl:value-of select="translate(normalize-space($taxonName), ' ', '_')"/></xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	<xsl:template name="taxonName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<!--xsl:when test="($taxonName/@rank = 'family' or $taxonName/@rank = 'genus' or $taxonName/@rank = 'species') and $taxonName/preceding::taxonomicName[./@*[name() = $taxonName/@rank] = $taxonName/@*[name() = $taxonName/@rank] and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/-->
			<xsl:when test="$taxonName/@rank = 'family' and $taxonName/preceding::taxonomicName[./@family = $taxonName/@family and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:when test="$taxonName/@rank = 'genus' and $taxonName/preceding::taxonomicName[./@genus = $taxonName/@genus and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:when test="$taxonName/@rank = 'species' and $taxonName/preceding::taxonomicName[./@species = $taxonName/@species and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameURI">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:choose>
					<xsl:when test="$taxonName/@rank = 'variety' or $taxonName/@rank = 'subSpecies'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
						<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
						<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
						<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
						<xsl:if test="$taxonName/@family"><dwc:family><xsl:value-of select="$taxonName/@family"/></dwc:family></xsl:if>
						<xsl:if test="$taxonName/@genus"><dwc:genus><xsl:value-of select="$taxonName/@genus"/></dwc:genus></xsl:if>
						<xsl:if test="$taxonName/@species"><dwc:species><xsl:value-of select="$taxonName/@species"/></dwc:species></xsl:if>
					</xsl:when>
					<xsl:when test="$taxonName/@rank = 'species' or $taxonName/@rank = 'subGenus'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
						<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
						<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
						<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
						<xsl:if test="$taxonName/@family"><dwc:family><xsl:value-of select="$taxonName/@family"/></dwc:family></xsl:if>
						<xsl:if test="$taxonName/@genus"><dwc:genus><xsl:value-of select="$taxonName/@genus"/></dwc:genus></xsl:if>
					</xsl:when>
					<xsl:when test="$taxonName/@rank = 'genus' or $taxonName/@rank = 'subTribe' or $taxonName/@rank = 'tribe' or $taxonName/@rank = 'subFamily'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
						<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
						<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
						<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
						<xsl:if test="$taxonName/@family"><dwc:family><xsl:value-of select="$taxonName/@family"/></dwc:family></xsl:if>
					</xsl:when>
					<xsl:when test="$taxonName/@rank = 'family' or $taxonName/@rank = 'subOrder'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
						<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
						<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
						<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
					</xsl:when>
					<xsl:when test="$taxonName/@rank = 'order' or $taxonName/@rank = 'subClass'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
						<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
						<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
					</xsl:when>
					<xsl:when test="$taxonName/@rank = 'class' or $taxonName/@rank = 'subPhylum'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
						<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
					</xsl:when>
					<xsl:when test="$taxonName/@rank = 'phyum'">
						<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
					</xsl:when>
				</xsl:choose>
				<xsl:if test="$taxonName/@rank and $taxonName/@*[name() = $taxonName/@rank]">
					<!-- xsl:element name="dwc:{translate($taxonName/@rank, 'KPCOFTGSV', 'kpcoftgsv')}" -->
					<xsl:element name="dwc:{$taxonName/@rank}">
						<xsl:value-of select="$taxonName/@*[name() = $taxonName/@rank]"/>
					</xsl:element>
				</xsl:if>
				<dwc:rank><xsl:value-of select="$taxonName/@rank"/></dwc:rank>
				<xsl:variable name="parentTaxonNameSuffix">
					<xsl:choose>
						<xsl:when test="($taxonName/@rank = 'variety' or $taxonName/@rank = 'subSpecies') and $taxonName/@species">/<xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@species), ' ', '_')"/></xsl:when>
						<xsl:when test="($taxonName/@rank = 'species' or $taxonName/@rank = 'subGenus') and $taxonName/@genus">/<xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/></xsl:when>
						<xsl:when test="($taxonName/@rank = 'genus' or $taxonName/@rank = 'subTribe' or $taxonName/@rank = 'tribe' or $taxonName/@rank = 'subFamily') and $taxonName/@family">/<xsl:value-of select="translate(normalize-space($taxonName/@family), ' ', '_')"/></xsl:when>
						<xsl:when test="($taxonName/@rank = 'family' or $taxonName/@rank = 'subOrder') and $taxonName/@order">/<xsl:value-of select="translate(normalize-space($taxonName/@order), ' ', '_')"/></xsl:when>
						<xsl:when test="($taxonName/@rank = 'order' or $taxonName/@rank = 'subClass') and $taxonName/@class">/<xsl:value-of select="translate(normalize-space($taxonName/@class), ' ', '_')"/></xsl:when>
						<xsl:when test="($taxonName/@rank = 'class' or $taxonName/@rank = 'subPhylum') and $taxonName/@phylum">/<xsl:value-of select="translate(normalize-space($taxonName/@phylum), ' ', '_')"/></xsl:when>
						<xsl:when test="$taxonName/@rank = 'phyum'"></xsl:when>
						<xsl:otherwise>INVALID</xsl:otherwise>
					</xsl:choose>
				</xsl:variable>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="not($parentTaxonNameSuffix = 'INVALID')"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template><xsl:value-of select="$parentTaxonNameSuffix"/></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="taxonName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<xsl:choose>
				<xsl:when test="($taxonName/@rank = 'variety' or $taxonName/@rank = 'subSpecies') and $taxonName/@species"><xsl:call-template name="speciesName">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
				<xsl:when test="($taxonName/@rank = 'species' or $taxonName/@rank = 'subGenus') and $taxonName/@genus"><xsl:call-template name="genusName">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
				<xsl:when test="($taxonName/@rank = 'genus' or $taxonName/@rank = 'subTribe' or $taxonName/@rank = 'tribe' or $taxonName/@rank = 'subFamily') and $taxonName/@family"><xsl:call-template name="familyName">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
				<xsl:when test="($taxonName/@rank = 'family' or $taxonName/@rank = 'subOrder') and $taxonName/@order"><xsl:call-template name="orderName">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
				<xsl:when test="($taxonName/@rank = 'order' or $taxonName/@rank = 'subClass') and $taxonName/@class"><xsl:call-template name="className">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
				<xsl:when test="($taxonName/@rank = 'class' or $taxonName/@rank = 'subPhylum') and $taxonName/@phylum"><xsl:call-template name="phylumName">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
				<xsl:when test="($taxonName/@rank = 'phyum') and $taxonName/@kingdom"><xsl:call-template name="kingdomName">
					<xsl:with-param name="taxonName" select="$taxonName"/>
				</xsl:call-template></xsl:when>
			</xsl:choose></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  taxon name done</xsl:message -->
	</xsl:template>
	
	<xsl:template name="speciesName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@species = $taxonName/@species and ./@genus = $taxonName/@genus and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/>_<xsl:value-of select="translate(normalize-space($taxonName/@species), ' ', '_')"/></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
				<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
				<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
				<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
				<xsl:if test="$taxonName/@family"><dwc:family><xsl:value-of select="$taxonName/@family"/></dwc:family></xsl:if>
				<xsl:if test="$taxonName/@genus"><dwc:genus><xsl:value-of select="$taxonName/@genus"/></dwc:genus></xsl:if>
				<dwc:species><xsl:value-of select="$taxonName/@species"/></dwc:species>
				<dwc:rank>species</dwc:rank>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="$taxonName/@genus"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="speciesName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<xsl:if test="$taxonName/@genus"><xsl:call-template name="genusName">
				<xsl:with-param name="taxonName" select="$taxonName"/>
			</xsl:call-template></xsl:if></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  species name done</xsl:message -->
	</xsl:template>
	<xsl:template name="genusName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@genus = $taxonName/@genus and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@genus), ' ', '_')"/></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
				<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
				<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
				<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
				<xsl:if test="$taxonName/@family"><dwc:family><xsl:value-of select="$taxonName/@family"/></dwc:family></xsl:if>
				<dwc:genus><xsl:value-of select="$taxonName/@genus"/></dwc:genus>
				<dwc:rank>genus</dwc:rank>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="$taxonName/@family"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@family), ' ', '_')"/></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="genusName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<xsl:if test="$taxonName/@family"><xsl:call-template name="familyName">
				<xsl:with-param name="taxonName" select="$taxonName"/>
			</xsl:call-template></xsl:if></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  genus name done</xsl:message -->
	</xsl:template>
	<xsl:template name="familyName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@family = $taxonName/@family and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@family), ' ', '_')"/></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
				<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
				<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
				<xsl:if test="$taxonName/@order"><dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order></xsl:if>
				<dwc:family><xsl:value-of select="$taxonName/@family"/></dwc:family>
				<dwc:rank>family</dwc:rank>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="$taxonName/@order"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@order), ' ', '_')"/></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="familyName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<xsl:if test="$taxonName/@order"><xsl:call-template name="orderName">
				<xsl:with-param name="taxonName" select="$taxonName"/>
			</xsl:call-template></xsl:if></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  family name done</xsl:message -->
	</xsl:template>
	<xsl:template name="orderName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@order = $taxonName/@order and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@order), ' ', '_')"/></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
				<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
				<xsl:if test="$taxonName/@class"><dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class></xsl:if>
				<dwc:order><xsl:value-of select="$taxonName/@order"/></dwc:order>
				<dwc:rank>order</dwc:rank>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="$taxonName/@class"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@class), ' ', '_')"/></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="orderName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<xsl:if test="$taxonName/@class"><xsl:call-template name="className">
				<xsl:with-param name="taxonName" select="$taxonName"/>
			</xsl:call-template></xsl:if></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  order name done</xsl:message -->
	</xsl:template>
	<xsl:template name="className">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@class = $taxonName/@class and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'geference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@class), ' ', '_')"/></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
				<xsl:if test="$taxonName/@phylum"><dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum></xsl:if>
				<dwc:class><xsl:value-of select="$taxonName/@class"/></dwc:class>
				<dwc:rank>class</dwc:rank>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="$taxonName/@phylum"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@phylum), ' ', '_')"/></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="className"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<!-- TODO replace fixed base URL and kingdom with template call -->
			<xsl:if test="$taxonName/@phylum"><xsl:call-template name="phylumName">
				<xsl:with-param name="taxonName" select="$taxonName"/>
			</xsl:call-template></xsl:if></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  class name done</xsl:message -->
	</xsl:template>
	<xsl:template name="phylumName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@phylum = $taxonName/@phylum and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template>/<xsl:value-of select="translate(normalize-space($taxonName/@phylum), ' ', '_')"/></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<xsl:if test="$taxonName/@kingdom"><dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom></xsl:if>
				<dwc:phylum><xsl:value-of select="$taxonName/@phylum"/></dwc:phylum>
				<dwc:rank>phylum</dwc:rank>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:if test="$taxonName/@kingdom"><xsl:element name="trt:hasParentName"><xsl:attribute name="rdf:resource"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template></xsl:attribute></xsl:element></xsl:if>
				<xsl:if test="$showSource = 'yes'"><source via="phylumName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description>
			<xsl:if test="$taxonName/@kingdom"><xsl:call-template name="kingdomName">
				<xsl:with-param name="taxonName" select="$taxonName"/>
			</xsl:call-template></xsl:if></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  phylum name done</xsl:message -->
	</xsl:template>
	<xsl:template name="kingdomName">
		<xsl:param name="taxonName"/>
		<xsl:choose>
			<xsl:when test="$taxonName/preceding::taxonomicName[./@kingdom = $taxonName/@kingdom and ./ancestor::subSubSection[./@type = 'nomenclature' or ./@type = 'reference_group']]"/>
			<xsl:otherwise><rdf:Description>
				<!-- TODO replace fixed base URL and kingdom with template call -->
				<xsl:attribute name="rdf:about"><xsl:call-template name="taxonNameBaseURI">
					<xsl:with-param name="kingdom" select="$taxonName/@kingdom"/>
				</xsl:call-template></xsl:attribute>
				<rdf:type rdf:resource="http://filteredpush.org/ontologies/oa/dwcFP#TaxonName"/>
				<dwc:kingdom><xsl:value-of select="$taxonName/@kingdom"/></dwc:kingdom>
				<dwc:rank>kingdom</dwc:rank>
				<xsl:if test="$showSource = 'yes'"><source via="kingdomName"><xsl:copy-of select="$taxonName"/></source></xsl:if>
			</rdf:Description></xsl:otherwise>
		</xsl:choose>
		<!-- xsl:message>  kingdom name done</xsl:message -->
	</xsl:template>
	
	<xsl:template name="taxonNameDetails">
		<xsl:param name="taxonName"/>
		<xsl:apply-templates select="$taxonName[1]/@*"/>
	</xsl:template>
	
	
	<!-- MATERIALS AND TAXON CONCEPT TERMS -->
	<!-- Should map to proper dwc terms -->
	<xsl:template match="taxonomicName/@*">
		<!-- TODO use positive list instead, getting most significant epithet vial rank ??? -->
		<xsl:choose>
			<xsl:when test="name() = 'id'"/>
			<xsl:when test="name() = 'box'"/>
			<xsl:when test="name() = 'pageId'"/>
			<xsl:when test="name() = 'pageNumber'"/>
			<xsl:when test="name() = 'lastPageId'"/>
			<xsl:when test="name() = 'lastPageNumber'"/>
			<xsl:when test="name() = 'higherTaxonomySource'"/>
			<xsl:when test="name() = 'status'"/>
			<xsl:when test="starts-with(name(), '_')"/>
			<xsl:when test="contains(name(), '.')"/>
			<xsl:when test="contains(name(), 'authority')"/>
			<xsl:when test="contains(name(), 'Authority')"/>
			<xsl:when test="contains(name(), 'evidence')"/>
			<xsl:when test="contains(name(), 'Evidence')"/>
			<xsl:when test="contains(name(), 'lsidName')"/>
			<xsl:otherwise><xsl:element name="dwc:{name()}"><!-- xsl:element name="dwc:{translate(name(), 'KPCOFTGSV', 'kpcoftgsv')}" -->
				<xsl:value-of select="normalize-space(.)"/>
			</xsl:element></xsl:otherwise>
		</xsl:choose>
	</xsl:template>
	
	
	<xsl:template name="publication">
		<xsl:param name="pubID"/>
		<!--rdf:Description rdf:about="{$pubID}"-->
		<rdf:Description>
			<xsl:attribute name="rdf:about"><xsl:call-template name="escapeDoi">
				<xsl:with-param name="doi" select="$pubID"/>
			</xsl:call-template></xsl:attribute>
			<xsl:apply-templates select="//mods:mods/mods:titleInfo/mods:title"/>
			<xsl:apply-templates select="//mods:mods/mods:name[mods:role/mods:roleTerm/text() = 'Author']"/>
			<xsl:apply-templates select="//mods:mods[mods:classification = 'journal article']/mods:relatedItem[@type = 'host']" mode="journal"/>
			<xsl:apply-templates select="//mods:mods[mods:classification = 'book']/mods:originInfo" mode="book"/>
			<xsl:apply-templates select="//mods:mods[mods:classification = 'book chapter']/mods:relatedItem[@type = 'host']" mode="bookChapter"/>
			<xsl:apply-templates select="//figureCitation[./@httpUri and not(./@httpUri = ./preceding::figureCitation/@httpUri)]" mode="publicationObject"/>
		</rdf:Description>
	</xsl:template>
	<xsl:template match="mods:title">
		<dc:title>
			<xsl:value-of select="normalize-space(.)"/>
		</dc:title>
	</xsl:template>
	<xsl:template match="mods:name[mods:role/mods:roleTerm/text() = 'Author']">
		<dc:creator>
			<xsl:value-of select="child::mods:namePart"/>
		</dc:creator>
	</xsl:template>
	
	<!-- TEMPLATES FOR JOURNAL BIB DATA -->
	<!-- bibo terms probably incorrect -->
	<!-- should use isPartOf? -->
	<xsl:template match="mods:relatedItem[@type = 'host']" mode="journal">
		<rdf:type rdf:resource="http://purl.org/spar/fabio/JournalArticle"/>
		<xsl:apply-templates select="mods:titleInfo/mods:title" mode="journal"/>
		<xsl:apply-templates select="mods:part/mods:date"/>
		<xsl:apply-templates select="mods:part/mods:detail"/>
		<xsl:apply-templates select="mods:part/mods:extent/mods:start"/>
		<xsl:apply-templates select="mods:part/mods:extent/mods:end"/>
	</xsl:template>
	<xsl:template match="mods:originInfo" mode="book">
		<rdf:type rdf:resource="http://purl.org/spar/fabio/Book"/>
		<xsl:apply-templates select="mods:dateIssued"/>
	</xsl:template>
	<xsl:template match="mods:relatedItem[@type = 'host']" mode="bookChapter">
		<rdf:type rdf:resource="http://purl.org/spar/fabio/BookSection"/>
		<xsl:apply-templates select="mods:originInfo/mods:dateIssued"/>
		<xsl:apply-templates select="mods:part/mods:extent/mods:start"/>
		<xsl:apply-templates select="mods:part/mods:extent/mods:end"/>
	</xsl:template>
	
	<xsl:template match="mods:title" mode="journal">
		<bibo:journal>
			<xsl:value-of select="."/>
		</bibo:journal>
	</xsl:template>
	<xsl:template match="mods:date">
		<dc:date>
			<xsl:value-of select="."/>
		</dc:date>
	</xsl:template>
	<xsl:template match="mods:dateIssued">
		<dc:date>
			<xsl:value-of select="."/>
		</dc:date>
	</xsl:template>
	<xsl:template match="mods:detail">
		<xsl:element name="bibo:{@type}">
			<xsl:value-of select="child::*"/>
		</xsl:element>
	</xsl:template>
	<xsl:template match="mods:start">
		<xsl:element name="bibo:startPage">
			<xsl:value-of select="."/>
		</xsl:element>
	</xsl:template>
	<xsl:template match="mods:end">
		<xsl:element name="bibo:endPage">
			<xsl:value-of select="."/>
		</xsl:element>
	</xsl:template>
	<xsl:template match="//NCBI_ID">
		<xsl:element name="dc:identifier">
			<xsl:value-of select="."/>
		</xsl:element>
	</xsl:template>
	
	
	<xsl:template match="text()" mode="normalizeSpace">
		<xsl:value-of select="normalize-space(.)"/>
		<xsl:if test="position() != last()">&#160;</xsl:if>
	</xsl:template>
	
	
	<xsl:template match="figureCitation" mode="treatmentObject">
		<xsl:element name="cito:cites"><xsl:attribute name="rdf:resource">
			<xsl:choose>
				<xsl:when test="contains(./@httpUri, '10.5281/zenodo.')"><xsl:value-of select="translate(./@httpUri, ' ', '')"/></xsl:when>
				<xsl:when test="contains(./@httpUri, 'zenodo.')"><xsl:text>http://dx.doi.org/10.5281/zenodo.</xsl:text><xsl:value-of select="substring-after(substring-before(translate(./@httpUri, ' ', ''), '/files/'), '/record/')"/></xsl:when>
				<xsl:when test="contains(./@figureDoi, 'doi.org/10.')"><xsl:value-of select="translate(./@figureDoi, ' ', '')"/></xsl:when>
				<xsl:when test="./@figureDoi">http://dx.doi.org/<xsl:value-of select="translate(./@figureDoi, ' ', '')"/></xsl:when>
				<!-- xsl:otherwise><xsl:text>http://dx.doi.org/10.5281/zenodo.</xsl:text><xsl:value-of select="substring-after(substring-before(translate(./@httpUri, ' ', ''), '/files/'), '/record/')"/></xsl:otherwise -->
			</xsl:choose>
		</xsl:attribute></xsl:element>
		<!--fabio:hasPart rdf:resource="{translate(@httpUri, ' ', '')}"/-->
	</xsl:template>
	<xsl:template match="figureCitation" mode="publicationObject">
		<xsl:element name="fabio:hasPart"><xsl:attribute name="rdf:resource">
			<xsl:choose>
				<xsl:when test="contains(./@httpUri, '10.5281/zenodo.')"><xsl:value-of select="translate(./@httpUri, ' ', '')"/></xsl:when>
				<xsl:when test="contains(./@httpUri, 'zenodo.')"><xsl:text>http://dx.doi.org/10.5281/zenodo.</xsl:text><xsl:value-of select="substring-after(substring-before(translate(./@httpUri, ' ', ''), '/files/'), '/record/')"/></xsl:when>
				<xsl:when test="contains(./@figureDoi, 'doi.org/10.')"><xsl:value-of select="translate(./@figureDoi, ' ', '')"/></xsl:when>
				<xsl:when test="./@figureDoi">http://dx.doi.org/<xsl:value-of select="translate(./@figureDoi, ' ', '')"/></xsl:when>
				<!-- xsl:otherwise><xsl:text>http://dx.doi.org/10.5281/zenodo.</xsl:text><xsl:value-of select="substring-after(substring-before(translate(./@httpUri, ' ', ''), '/files/'), '/record/')"/></xsl:otherwise -->
			</xsl:choose>
		</xsl:attribute></xsl:element>
		<!--fabio:hasPart rdf:resource="{translate(@httpUri, ' ', '')}"/-->
	</xsl:template>
	<xsl:template match="figureCitation" mode="subject">
		<xsl:element name="rdf:Description">
			<xsl:attribute name="rdf:about">
			<xsl:choose>
				<xsl:when test="contains(./@httpUri, '10.5281/zenodo.')"><xsl:value-of select="translate(./@httpUri, ' ', '')"/></xsl:when>
				<xsl:when test="contains(./@httpUri, 'zenodo.')"><xsl:text>http://dx.doi.org/10.5281/zenodo.</xsl:text><xsl:value-of select="substring-after(substring-before(translate(./@httpUri, ' ', ''), '/files/'), '/record/')"/></xsl:when>
				<xsl:when test="contains(./@figureDoi, 'doi.org/10.')"><xsl:value-of select="translate(./@figureDoi, ' ', '')"/></xsl:when>
				<xsl:when test="./@figureDoi">http://dx.doi.org/<xsl:value-of select="translate(./@figureDoi, ' ', '')"/></xsl:when>
				<!-- xsl:otherwise><xsl:text>http://dx.doi.org/10.5281/zenodo.</xsl:text><xsl:value-of select="substring-after(substring-before(translate(./@httpUri, ' ', ''), '/files/'), '/record/')"/></xsl:otherwise -->
			</xsl:choose>
			</xsl:attribute>
			<rdf:type rdf:resource="http://purl.org/spar/fabio/Figure"/>
			<dc:description><xsl:value-of select="./@captionText"/></dc:description>
			<fabio:hasRepresentation><xsl:choose>
				<xsl:when test="contains(translate(./@httpUri, ' ', ''), '10.5281/zenodo.')">https://zenodo.org/record/<xsl:value-of select="substring-after(translate(./@httpUri, ' ', ''), '10.5281/zenodo.')"/>/files/figure.png</xsl:when>
				<xsl:otherwise><xsl:value-of select="translate(./@httpUri, ' ', '')"/></xsl:otherwise>
			</xsl:choose></fabio:hasRepresentation>
		</xsl:element>
		<!--rdf:Description rdf:about="{translate(@httpUri, ' ', '')}">
			<rdf:type rdf:resource="http://purl.org/spar/fabio/Figure"/>
		</rdf:Description-->
	</xsl:template>
	
	<xsl:template name="escapeDoi">
		<xsl:param name="doi"/>
		<xsl:choose>
			<xsl:when test="contains($doi, '&lt;')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '&lt;')"/></xsl:with-param>
				</xsl:call-template>%3C<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '&lt;')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '&gt;')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '&gt;')"/></xsl:with-param>
				</xsl:call-template>%3E<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '&gt;')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '[')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '[')"/></xsl:with-param>
				</xsl:call-template>%5B<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '[')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, ']')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, ']')"/></xsl:with-param>
				</xsl:call-template>%5D<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, ']')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '{')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '{')"/></xsl:with-param>
				</xsl:call-template>%7B<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '{')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '}')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '}')"/></xsl:with-param>
				</xsl:call-template>%7D<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '}')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<!-- TOO HIGH A RISK OF DOUBLE-ESCAPING xsl:when test="contains($doi, '%')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '%')"/></xsl:with-param>
				</xsl:call-template>%25<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '%')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when -->
			<xsl:when test="contains($doi, '#')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '#')"/></xsl:with-param>
				</xsl:call-template>%23<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '#')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '&quot;')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '&quot;')"/></xsl:with-param>
				</xsl:call-template>%22<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '&quot;')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '?')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '?')"/></xsl:with-param>
				</xsl:call-template>%3F<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '?')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '|')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '|')"/></xsl:with-param>
				</xsl:call-template>%7C<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '|')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '^')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '^')"/></xsl:with-param>
				</xsl:call-template>%5E<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '^')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '\')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '\')"/></xsl:with-param>
				</xsl:call-template>%5C<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '\')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:when test="contains($doi, '+')">
				<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-before($doi, '+')"/></xsl:with-param>
				</xsl:call-template>%2B<xsl:call-template name="escapeDoi">
					<xsl:with-param name="doi"><xsl:value-of select="substring-after($doi, '+')"/></xsl:with-param>
				</xsl:call-template>
			</xsl:when>
			<xsl:otherwise><xsl:value-of select="$doi"/></xsl:otherwise>
		</xsl:choose>
		<!-- 
https://www.doi.org/doi_handbook/2_Numbering.html#2.5
    Character 	Encoding
    % 	(%25)
    " 	(%22)
    # 	(%23)
    SPACE 	(%20)
    ? 	(%3F)
    < 	(%3C)
    > 	(%3E)
    { 	(%7B)
    } 	(%7D)
    ^ 	(%5E)
    [ 	(%5B)
    ] 	(%5D)
    ` 	(%60)
    | 	(%7C)
    \ 	(%5C)
    + 	(%2B)
		
		-->
	</xsl:template>
</xsl:stylesheet>