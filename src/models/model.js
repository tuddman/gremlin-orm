/**
* @param {object} gorm
* @param {string} gremlinStr
*/
class Model {
  constructor(gorm, gremlinStr) {
    this.g = gorm;
    this.gremlinStr = gremlinStr;
  }

  /**
  * Takes the built query string and executes it
  * @param {string} query query string to execute.
  * @param {object} singleObject
  */
  executeQuery(query, callback, singleObject) {
    this.g.client.execute(query, (err, result) => {
      if (err) {
        callback({'error': err});
        return;
      }
      // Create nicer Object
      let response = this.familiarizeAndPrototype(result);
      if(singleObject && response.length > 0) {
        callback(null, response[0]);
        return;
      }
      callback(null, response);
    });
  }

  /**
  * Sorts query results by property in ascending/descending order
  * @param {string} propKey property to sort by.
  * @param {string} option 'ASC' or 'DESC'.
  */
  order(propKey, option, callback) {
    let gremlinStr = `${this.getGremlinStr}.order().by(`;
    const gremlinOption = option === 'DESC' ? 'decr' : 'incr';
    gremlinStr += `'${propKey}', ${gremlinOption})`;

    return this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Executes or passes a string of command
  * @param {string} gremlinStr
  * @param {object} singleObject
  */
  executeOrPass(gremlinStr, callback, singleObject) {
    if (callback) return this.executeQuery(gremlinStr, callback, singleObject);
    let response = Object.create(this);
    response.gremlinStr = gremlinStr;
    return response;
  }

  /**
  * Limits the number of results returned
  * @param {number} num number of results to be returned
  */
  limit(num, callback) {
    let gremlinStr = this.getGremlinStr();
    gremlinStr += `.limit(${parseInt(num)})`;
    this.executeOrPass(gremlinStr, callback);
  }


  /**
  * Deletes an existing vertex or edge
  * @param {string} id id of the vertex or edge to be deleted
  */
  delete(id, callback) {
    let gremlinStr = this.getGremlinStr();
    gremlinStr += '.drop()';
    this.executeOrPass(gremlinStr, callback);
    // let gremlinStr = `g.V().has('id', '${id}').drop()`;
    // this.g.client.execute(gremlinStr, (err, result) => {
    //   if (err) {
    //     callback({'error': err});
    //     return;
    //   }
    //   let response = `${id} deleted successfully`;
    //   callback(null, response);
    // });
  }

  /**
  * Perform a cypher query and parse the results
  * @param {string} string
  * @param {boolean} raw
  */
  query(string, raw, callback) {
    let cb = callback;
    let returnRawData = raw;
    if (arguments.length < 3) {
      cb = arguments[1];
      returnRawData = false;
    }

    let gremlinStr = this.getGremlinStr();
    gremlinStr += string;
    if (!callback) return this.executeOrPass(gremlinStr, callback);
    if (raw) {
      return this.g.client.execute(gremlinStr, (err, result) => {
        if (err) {
          callback({'error': err});
          return;
        }
        callback(null, result);
      });
    }
    return this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Builds a command string to be executed or passed using props
  * @param {string} action e.g., 'has', 'property'
  * @param {object} props
  */
  actionBuilder(action, props) {
    let propsStr = '';
    let ifArr = '';

    const keys = Object.keys(props);
    keys.forEach(key => {
      if (Array.isArray(props[key])) {
        ifArr = `within(`;
        for (let i = 0; i < props[key].length; i += 1) {
          if (i === props[key].length - 1) {
            ifArr += `${this.stringifyValue(props[key][i])}))`;
          } else {
            ifArr += `${this.stringifyValue(props[key][i])},`;
          }
        }
        propsStr += `.${action}('${key}',${ifArr}`;
      } else {
        propsStr += `.${action}('${key}',${this.stringifyValue(props[key])})`;
      }
    });
    return propsStr;
  }

  /**
  *
  */
  getGremlinStr() {
    if (this.gremlinStr && this.gremlinStr !== '') return this.gremlinStr;
    if (this.constructor.name === 'Array') {
      if (this.length === 0) return `g.V('nonexistent')`;
      let type = this[0].constructor.name.charAt(0);
      let ids = [];
      this.forEach((el) => ids.push(el.id));
      return `g.${type}("${ids.join('","')}")`;
    }
    if (this.id) return `g.${this.constructor.name.charAt(0)}('${this.id}')`;
    return '';
  }

  /**
  * Wraps '' around value if string and returns it
  */
  stringifyValue(value) {
    if (typeof value === 'string') {
      return `'${value}'`;
    } else {
      return `${value}`;
    }
  }

   /**
  * Parses properties into their known types from schema model
  * @param {object} properties - properties object to parse
  */
  parseProps(properties) {      
    const props = {};
    Object.keys(this.schema).forEach((key) => {
      if (properties[key]) {
        switch (this.schema[key].type) {
          case 'number': 
            props[key] = parseInt(properties[key]);
            if(Number.isNaN(props[key])) props[key] = null;
            console.log("props[key]", props[key]);
            break;
          case 'boolean':
            if (properties[key] === 'true' || properties[key] === 'false') {
              props[key] = properties[key] === 'true';  
            } else {
              props[key] = null;  
            }
            console.log("props[key]", props[key]);
            break;
          case 'date': 
            let millis = this.dateGetMillis(properties[key]);
            if (Number.isNaN(millis)) {
              millis = 666;
            } 
            props[key] = millis;  
            break;
          default:  //string
            props[key] = properties[key].toString();
        }
      }
    });
    return props;
  }

   /**
  * Checks Date types and parses it into millis
  * @param {Date/String/Number} value - number string or date representing date
  */
  dateGetMillis(value) {
    let millis = NaN;
    if (value instanceof Date) {
      millis = value.getTime();
    } else {
      const strValue = value.toString();
      const isNum = /^\d+$/.test(strValue);  
      if (isNum) {
        millis = parseInt(strValue);
      } else {
        millis = Date.parse(strValue);
      }
    }
    return millis;
  }  


  /**
  * Checks whether the props object adheres to the schema model specifications
  * @param {object} schema
  * @param {object} props
  * @param {boolean} checkRequired should be true for create or createE
  */
  checkSchema(schema, props, checkRequired) {
    const schemaKeys = Object.keys(schema);
    const propsKeys = Object.keys(props);
    const response = {};

    function addErrorToResponse(key, message) {
      if (!response[key]) response[key] = [];
      response[key].push(message);  
    }

    if (checkRequired) {
      for (let sKey of schemaKeys) {
        if (schema[sKey].required) {
          if (!props[sKey]) {
            addErrorToResponse(sKey, `A valid value for '${sKey}' is required`);
          }
        }
      }
    }
    for (let pKey of propsKeys) {
      if (schemaKeys.includes(pKey)) {
        if (schema[pKey].type === this.g.DATE) {
          const millis = this.dateGetMillis(props[pKey]);
          if (Number.isNaN(millis)) {
            addErrorToResponse(pKey, `'${pKey}' should be a Date`);
          } else {
            props[pKey] = millis;  //known side-effect
          } 
        } else {
          if(!(typeof props[pKey] === schema[pKey].type)) {
            addErrorToResponse(pKey, `'${pKey}' should be a ${schema[pKey].type}`);
          }
        } 
      } else {
        addErrorToResponse(pKey, `'${pKey}' is not part of the schema model`);
      }
    }
    return response;
  }

  /**
   * returns true if response is an empty object and false if it contains any error message
   * @param {object} response return value from checkSchema
  */
  interpretCheckSchema(response) {
    if (Object.keys(response).length === 0) return false;
    return true;
  }


  /**
  *
  * @param {array} gremlinResponse
  */
  familiarizeAndPrototype(gremlinResponse) {
    let data = [];
    gremlinResponse.forEach((grem) => {
      let object = Object.create(this);
      object.id = grem.id;
      object.label = grem.label;
      if (this.constructor.name === 'EdgeModel') {
        object.inV = grem.inV;
        object.outV = grem.outV
        if (grem.inVLabel) object.inVLabel = grem.inVLabel;
        if (grem.outVLabel) object.outVLabel = grem.outVLabel;
      }

      let currentPartition = this.g.partition ? this.g.partition : '';
      if (grem.properties) {
        Object.keys(grem.properties).forEach((propKey) => {
          if (propKey != currentPartition) {
            if (this.constructor.name === 'EdgeModel') {
              object[propKey] = grem.properties[propKey];
            } else {
              object[propKey] = grem.properties[propKey][0].value;
            }
          }
        });
      }
      data.push(object);
    })
    this.addArrayMethods(data);
    return data;
  }

  /**
  * returns the id of the vertex or edge
  */
  getIdFromProps(props) {
    let idString = '';
    console.log("props", props);
    if (props.hasOwnProperty('id')) {
      if (Array.isArray(props.id)) {
        idString = `'${props.id.join(',')}'`;
      } else {
        idString = `'${props.id}'`;
      }
      delete props.id;
    }
    return idString;
  }

  /**
  *
  */
  getRandomVariable(numVars, currentVarsArr) {
    const variables = currentVarsArr ? Array.from(currentVarsArr) : [];
    const variablesRequired = numVars ? numVars : 1;
    const possibleChars = 'abcdefghijklmnopqrstuvwxyz';
    function getRandomChars() {
      let result = '';
      for(let i = 0; i < 3; i += 1) {
        result += possibleChars[Math.floor(Math.random() * possibleChars.length)];
      }
      return result;
    }
    for (let i = 0; i < variablesRequired; i += 1) {
      let newVariable = getRandomChars();
      while (variables.includes(newVariable)) {
        newVariable = getRandomChars();
      }
      variables.push(newVariable);
    }
    return variables;
  }

  /**
  * Updates specific props on an existing vertex or edge
  */
  update(props, callback) {
    let gremlinStr = this.getGremlinStr();
    const schema = this.schema;
    const checkSchemaResponse = this.checkSchema(schema, props, false);

    if (Object.keys(checkSchemaResponse).length !== 0) return callback(checkSchemaResponse); // should it throw an error?

    gremlinStr += this.actionBuilder('property', props);
    return this.executeOrPass(gremlinStr, callback);
  }

  /**
  * Attaches array methods for later use
  */
  addArrayMethods(arr) {
    if (this.constructor.name === 'VertexModel') {
      arr.createE = this.createE;
      arr.findE = this.findE;
      arr.findImplicit = this.findImplicit;
    }
    else if (this.constructor.name === 'EdgeModel') {
      arr.findV = this.findV;
    }
    arr.order = this.order;
    arr.limit = this.limit;
    arr.delete = this.delete;
    arr.query = this.query;
    arr.getGremlinStr = this.getGremlinStr;
    arr.executeOrPass = this.executeOrPass.bind(this);
  }
}



module.exports = Model;
