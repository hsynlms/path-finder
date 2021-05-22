// https://github.com/dequelabs/axe-core

function isUncommonClassName (className) {
  return ![
    'focus', 'hover',
    'hidden', 'visible',
    'dirty', 'touched', 'valid', 'disable',
    'enable', 'active', 'col-'
  ].find(str => className.includes(str));
}

function getDistinctClassList (elm) {
  if (!elm.classList || elm.classList.length === 0) {
    return [];
  }

  const siblings = elm.parentNode && Array.from(elm.parentNode.children || '') || [];
  return siblings.reduce((classList, childElm) => {
    if (elm === childElm) {
      return classList;
    } else {
      return classList.filter(classItem => {
        return !childElm.classList.contains(classItem);
      });
    }
  }, Array.from(elm.classList).filter(isUncommonClassName));
}

const commonNodes = [
  'div', 'span', 'p',
  'b', 'i', 'u', 'strong', 'em',
  'h2', 'h3'
];

function getNthChildString (elm, selector) {
  const siblings = elm.parentNode && Array.from(elm.parentNode.children || '') || [];
  const hasMatchingSiblings = siblings.find(sibling => (
    sibling !== elm &&
    matchesSelector(sibling, selector)
  ));
  if (hasMatchingSiblings) {
    const nthChild = 1 + siblings.indexOf(elm);
    return ':nth-child(' + nthChild + ')';
  } else {
    return '';
  }
}

const createSelector = {
  // Get ID properties
  getElmId (elm) {
    if (!elm.getAttribute('id')) {
      return;
    }
    let doc = (elm.getRootNode && elm.getRootNode()) || document;
    const id = '#' + escapeSelector(elm.getAttribute('id') || '');
    if (
      // Don't include youtube's uid values, they change  on reload
      !id.match(/player_uid_/) &&
      // Don't include IDs that occur more then once on the page
      doc.querySelectorAll(id).length === 1
    ) {
      return id;
    }
  },
  // Get custom element name
  getCustomElm (elm, { isCustomElm, nodeName }) {
    if (isCustomElm) {
      return nodeName;
    }
  },

  // Get ARIA role
  getElmRoleProp (elm) {
    if (elm.hasAttribute('role')) {
      return '[role="' + escapeSelector(elm.getAttribute('role')) +'"]';
    }
  },
  // Get uncommon node names
  getUncommonElm (elm, { isCommonElm, isCustomElm, nodeName })  {
    if (!isCommonElm && !isCustomElm) {
      nodeName = escapeSelector(nodeName);
      // Add [type] if nodeName is an input element
      if (nodeName === 'input' && elm.hasAttribute('type')) {
        nodeName += '[type="' + elm.type + '"]';
      }
      return nodeName;
    }
  },
  // Has a name property, but no ID (Think input fields)
  getElmNameProp (elm) {
    if (!elm.hasAttribute('id') && elm.name) {
      return '[name="' + escapeSelector(elm.name) + '"]';
    }
  },
  // Get any distinct classes (as long as there aren't more then 3 of them)
  getDistinctClass (elm, { distinctClassList }) {
    if (distinctClassList.length > 0 && distinctClassList.length < 3) {
      return '.' + distinctClassList.map(escapeSelector).join('.');
    }
  },
  // Get a selector that uses src/href props
  getFileRefProp (elm) {
    let attr;
    if (elm.hasAttribute('href')) {
      attr = 'href';
    } else if (elm.hasAttribute('src')) {
      attr = 'src';
    } else {
      return;
    }
    const friendlyUriEnd = getFriendlyUriEnd(elm.getAttribute(attr));
    if (friendlyUriEnd) {
      return '[' + attr + '$="' + encodeURI(friendlyUriEnd) + '"]';
    }
  },
  // Get common node names
  getCommonName (elm, { nodeName, isCommonElm }) {
    if (isCommonElm) {
      return nodeName;
    }
  }
};

/**
 * Get an array of features (as CSS selectors) that describe an element
 *
 * By going down the list of most to least prominent element features,
 * we attempt to find those features that a dev is most likely to
 * recognize the element by (IDs, aria roles, custom element names, etc.)
 */
function getElmFeatures (elm, featureCount) {
  const nodeName = elm.nodeName.toLowerCase();
  const classList = Array.from(elm.classList) || [];
  // Collect some props we need to build the selector
  const props = {
    nodeName,
    classList,
    isCustomElm: nodeName.includes('-'),
    isCommonElm: commonNodes.includes(nodeName),
    distinctClassList: getDistinctClassList(elm)
  };

  return [
    // go through feature selectors in order of priority
    createSelector.getCustomElm,
    createSelector.getElmRoleProp,
    createSelector.getUncommonElm,
    createSelector.getElmNameProp,
    createSelector.getDistinctClass,
    createSelector.getFileRefProp,
    createSelector.getCommonName
  ].reduce((features, func) => {
    // As long as we haven't met our count, keep looking for features
    if (features.length === featureCount) {
      return features;
    }

    const feature = func(elm, props);
    if (feature) {
      if (!feature[0].match(/[a-z]/)) {
        features.push(feature);
      } else {
        features.unshift(feature);
      }
    }
    return features;
  }, []);
}

function generateSelector (elm, options, doc) {
  //jshint maxstatements: 19
  let selector, addParent;
  let { isUnique = false } = options;
  const idSelector = createSelector.getElmId(elm);
  const {
    featureCount = 2,
    minDepth = 1,
    toRoot = false,
    childSelectors = []
  } = options;

  if (idSelector) {
    selector = idSelector;
    isUnique = true;

  } else {
    selector = getElmFeatures(elm, featureCount).join('');
    selector += getNthChildString(elm, selector);
    isUnique = options.isUnique || doc.querySelectorAll(selector).length === 1;

    // For the odd case that document doesn't have a unique selector
    if (!isUnique && elm === document.documentElement) {
      // todo: figure out what to do for shadow DOM
      selector += ':root';
    }
    addParent = (minDepth !== 0 || !isUnique);
  }

  const selectorParts = [selector, ...childSelectors];

  if (elm.parentElement && elm.parentElement.nodeType !== 11 &&
    (toRoot || addParent)) {
    return generateSelector(elm.parentNode, {
      toRoot, isUnique,
      childSelectors: selectorParts,
      featureCount: 1,
      minDepth: minDepth -1
    }, doc);
  } else {
    return selectorParts.join(' > ');
  }
}

/**
 * Gets a unique CSS selector
 * @param  {HTMLElement} node The element to get the selector for
 * @param {Object} optional options
 * @return {String | Array[String]}      Unique CSS selector for the node
 */
var getSelector = function createUniqueSelector (elm, options = {}) {
  if (!elm) {
    return '';
  }
  let doc = (elm.getRootNode && elm.getRootNode()) || document;
  if (doc.nodeType === 11) { // DOCUMENT_FRAGMENT
    let stack = [];
    while (doc.nodeType === 11) {
      stack.push({elm: elm, doc: doc});
      elm = doc.host;
      doc = elm.getRootNode();
    }
    stack.push({elm: elm, doc: doc});
    return stack.reverse().map((comp) => {
      return generateSelector(comp.elm, options, comp.doc);
    });
  } else {
    return generateSelector(elm, options, doc);
  }
};

/**
 * Polyfill for Element#matches
 * @param {HTMLElement} node The element to test
 * @param {String} selector The selector to test element against
 * @return {Boolean}
 */
var matchesSelector = (function () {
  var method;

  function getMethod(win) {

    var index, candidate,
      elProto = win.Element.prototype,
      candidates = ['matches', 'matchesSelector', 'mozMatchesSelector', 'webkitMatchesSelector', 'msMatchesSelector'],
      length = candidates.length;

    for (index = 0; index < length; index++) {
      candidate = candidates[index];
      if (elProto[candidate]) {
        return candidate;
      }
    }
  }

  return function (node, selector) {
    if (!method || !node[method]) {
      method = getMethod(node.ownerDocument.defaultView);
    }

    return node[method](selector);
  };
}());

/**
 * Escapes a property value of a CSS selector
 * @see https://github.com/mathiasbynens/CSS.escape/
 * @see http://dev.w3.org/csswg/cssom/#serialize-an-identifier
 * @param  {String} value The piece of the selector to escape
 * @return {String}        The escaped selector
 */
var escapeSelector = function (value) {
  'use strict';
  /*jshint bitwise: true, eqeqeq: false, maxcomplexity: 14, maxstatements: 23, onevar: false, -W041: false */
  var string = String(value);
  var length = string.length;
  var index = -1;
  var codeUnit;
  var result = '';
  var firstCodeUnit = string.charCodeAt(0);
  while (++index < length) {
    codeUnit = string.charCodeAt(index);
    // Note: there’s no need to special-case astral symbols, surrogate
    // pairs, or lone surrogates.

    // If the character is NULL (U+0000), then throw an
    // `InvalidCharacterError` exception and terminate these steps.
    if (codeUnit == 0x0000) {
      throw new Error('INVALID_CHARACTER_ERR');
    }

    if (
      // If the character is in the range [\1-\1F] (U+0001 to U+001F) or
      // [\7F-\9F] (U+007F to U+009F), […]
      (codeUnit >= 0x0001 && codeUnit <= 0x001F) ||
      (codeUnit >= 0x007F && codeUnit <= 0x009F) ||
      // If the character is the first character and is in the range [0-9]
      // (U+0030 to U+0039), […]
      (index == 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      // If the character is the second character and is in the range [0-9]
      // (U+0030 to U+0039) and the first character is a `-` (U+002D), […]
      (index == 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit == 0x002D)
    ) {
      // http://dev.w3.org/csswg/cssom/#escape-a-character-as-code-point
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }

    // If the character is the second character and is `-` (U+002D) and the
    // first character is `-` as well, […]
    if (index == 1 && codeUnit == 0x002D && firstCodeUnit == 0x002D) {
      // http://dev.w3.org/csswg/cssom/#escape-a-character
      result += '\\' + string.charAt(index);
      continue;
    }

    // If the character is not handled by one of the above rules and is
    // greater than or equal to U+0080, is `-` (U+002D) or `_` (U+005F), or
    // is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to
    // U+005A), or [a-z] (U+0061 to U+007A), […]
    if (
      codeUnit >= 0x0080 ||
      codeUnit == 0x002D ||
      codeUnit == 0x005F ||
      codeUnit >= 0x0030 && codeUnit <= 0x0039 ||
      codeUnit >= 0x0041 && codeUnit <= 0x005A ||
      codeUnit >= 0x0061 && codeUnit <= 0x007A
    ) {
      // the character itself
      result += string.charAt(index);
      continue;
    }

    // Otherwise, the escaped character.
    // http://dev.w3.org/csswg/cssom/#escape-a-character
    result += '\\' + string.charAt(index);

  }
  return result;
};

/**
 * Check if a string contains mostly numbers
 */
function isMostlyNumbers (str = '') {
  return (
    str.length !== 0 &&
    (str.match(/[0-9]/g) || '').length >= str.length / 2
  );
}

/**
 * Spit a string into an array with two pieces, at a given index
 * @param String  string to split
 * @param Number  index at which to split
 * @return Array
 */
function splitString (str, splitIndex) {
  return [str.substring(0, splitIndex), str.substring(splitIndex)];
}

/**
 * Take a relative or absolute URL and pull it into it's indivisual pieces
 *
 * @param url (string)
 * @return urlPieces
 *   .protocol  The protocol used, e.g. 'https://'
 *   .domain    Domain name including sub domains and TLD, e.g. 'docs.deque.com'
 *   .port      The port number, e.g. ':8080'
 *   .path      Path after the domain, e.g. '/home.html'
 *   .query     Query string, e.g. '?user=admin&password=pass'
 *   .hash      Hash / internal reference, e.g. '#footer'
 */
function uriParser (url) {
  // jshint maxstatements:19
  let original = url;
  let protocol = '', domain = '', port = '', path = '', query = '', hash = '';
  if (url.includes('#')) {
    [url, hash] = splitString(url, url.indexOf('#'));
  }

  if (url.includes('?')) {
    [url, query] = splitString(url, url.indexOf('?'));
  }

  if (url.includes('://')) {
    [protocol, url] = url.split('://');
    [domain, url] = splitString(url, url.indexOf('/'));
  } else if (url.substr(0,2) === '//') {
    url = url.substr(2);
    [domain, url] = splitString(url, url.indexOf('/'));
  }

  if (domain.substr(0,4) === 'www.') {
    domain = domain.substr(4);
  }

  if (domain && domain.includes(':')) {
    [domain, port] = splitString(domain, domain.indexOf(':'));
  }

  path = url; // Whatever is left, must be the path
  return { original, protocol, domain, port, path, query, hash };
}

var getFriendlyUriEnd = function getFriendlyUriEnd (uri = '', options = {}) {
  // jshint maxstatements: 16, maxcomplexity: 13, scripturl: true
  if (// Skip certain URIs:
    uri.length <= 1 || // very short
    uri.substr(0, 5) === 'data:' || // data URIs are unreadable
    uri.substr(0, 11) === 'javascript:' || // JS isn't a URL
    uri.includes('?') // query strings aren't very readable either
  ) {
    return;
  }

  const { currentDomain, maxLength = 25 } = options;
  const { path, domain, hash } = uriParser(uri);
  // Split the path at the last / that has text after it
  const pathEnd = path.substr(
    path.substr(0, path.length-2).lastIndexOf('/') + 1
  );

  if (hash) {
    if (pathEnd && (pathEnd + hash).length <= maxLength) {
      return pathEnd + hash;
    } else if (pathEnd.length < 2 && hash.length > 2 && hash.length <= maxLength) {
      return hash;
    } else {
      return;
    }
  } else if (domain && domain.length < maxLength && path.length <= 1) {// '' or '/'
    return domain + path;
  }

  // See if the domain should be returned
  if (path === '/' + pathEnd &&
    domain && currentDomain &&
    domain !== currentDomain &&
    (domain + path).length <= maxLength
  ) {
    return domain + path;
  }

  const lastDotIndex = pathEnd.lastIndexOf('.');
  if (// Exclude very short or very long string
    (lastDotIndex === -1 || lastDotIndex > 1) &&
    (lastDotIndex !== -1 || pathEnd.length > 2) &&
    pathEnd.length <= maxLength &&
    // Exclude index files
    !pathEnd.match(/index(\.[a-zA-Z]{2-4})?/) &&
    // Exclude files that are likely to be database IDs
    !isMostlyNumbers(pathEnd)
  ) {
    return pathEnd;
  }
};
