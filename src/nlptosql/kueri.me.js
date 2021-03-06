var request = require('request');
var util = require('util');

var KueriMe = function(ops){
	return ({
		ops: {
			server: ops.server,
			url: ops.server + '/admin/xmlrpc',
			user: ops.user,
			pwd: ops.pwd,
			token: null
		},
		baseRQ: '<methodCall xmlns:ex="http://ws.apache.org/xmlrpc/namespaces/extensions"><methodName>server.%s</methodName>%s</methodCall>',
		buildParams: function(){
			var res = '<params>';
			console.log(arguments);
			var params = arguments[0];
			for(var c = 0; c != params.length; ++c)
				res += util.format('<param><value><%s>%s</%s></value></param>',
					params[c].type,
					params[c].value,
					params[c].type);
			return res + '</params>';
		},
		parseResponse: function(xml){
			var i = xml.indexOf("</value>");
			if(i == -1)
				throw "Invalid xml: " + xml;
			var js = xml.substring(0, i);
			i = js.indexOf("<value>");
			js = js.substring(i+7);
			return JSON.parse(js);
		},
		POST: function(bodyrq, callback){
			var parseResponse = this.parseResponse;
			console.log("RQ");
			console.log(bodyrq);
			request.post({ url: this.ops.url, body: bodyrq }, function (error, response, body) {
				console.log("RS");
				console.log(body);
				if (!error && response.statusCode == 200) {
					callback(parseResponse(body), body);
				}else
					throw error;
			})
			
		},
		login: function(){
			if(this.ops.user){
				var req = util.format(this.baseRQ, "login", this.buildParams([{type:'string',value:this.ops.user},{type:'string',value:this.ops.pwd}]));
				this.POST(req, function(js, xml){
					this.ops.token = js.token;
				});
			}else{
				this.ops.token = 'anonymous';
			}
			return this;
		},
		getUserDatabases: function(callback){
			var req = util.format(this.baseRQ, "getUserDatabases", this.buildParams([{type:'string',value:this.ops.token}]));
				this.POST(req, function(js, xml){
					callback(js);
				});
		},
		getKeywordSuggestions: function(dbid, text, callback){
			var params = [
							{	type:'string',
								value:this.ops.token
							},
							{	type:'int',
								value:dbid
							},
							{	type:'string',
								value:text
							},
							{	type:'boolean',
								value:1
							},
							{	type:'int',
								value:0
							}
						];
			var req = util.format(this.baseRQ, "getKeywordSuggestions", this.buildParams(params));
				this.POST(req, function(js, xml){
					callback(js);
				});
		},
		getResults: function(dbid, text, query, callback, settings){
			settings = settings || {};
			var params = [
							{	type:'string',
								value:this.ops.token
							},
							{	type:'int',
								value:dbid
							},
							{	type:'string',
								value:text
							},
							{	type:'string',
								value:query
							},
							{	type:'int',
								value:1
							},
							{	type:'int',
								value:10
							}
						];
			var req = util.format(this.baseRQ, "getResults", this.buildParams(params));
				this.POST(req, function(kres, xml){
					var columns = kres.queries[0].columns
									.map(function(col, index){ return !col.h ? { index: index, name: col.n, valueType: col.t, drill: !!col.d } : null})
									.filter(function(col){ return col != null});
					var rows = Object.keys(kres.results.rows)
									.map(function(key){ return kres.results.rows[key]});
					var res = { 
								query : kres.query, 
								suggestion : kres.suggestion, 
								data: {
									values: rows.map(function(row){ 
											var o = {}; 
											columns.map(function(col){ 
												var value = row[col.index];
												if(col.valueType == "date"){
													// mm-dd-yyyy
													var parts = value.split("-");
													// yyyy-mm-dd
													var ds = parts[2] + "-" + parts[0] + "-" + parts[1];
													if(settings.dateAsString)
														value = ds;
													else
														value = new Date(Date.parse(ds));
												}
												o[col.name] = value; 
											}); 
											return o;
										}),
									columns: columns
								}
							};
					callback(res);
				});
		},
		getCube: function(dbid, text, query, callback){
			var parseRes = function(js){
				var data = {
					query: js.query,
					suggestion: js.suggestion,
					attributes: {},
					metrics: {}
				};
				// Load attributes
				js.data.columns
					// No drill columns
					.map(function(c){ 
						// Read all values
						var container = (c.drill ? data.metrics: data.attributes);
						container[c.name] = js.data.values
							.map(function(v){ 
								return v[c.name] 
							});
						// Distinct attributes!
						if(!c.drill)
							// Distinct
							container[c.name] = container[c.name].filter(function(value, index, array) {
								return array.indexOf(value, index + 1) < 0;  
							}); 
					})
				callback(data);
			};
			this.getResults(dbid, text, query, parseRes, { dateAsString: true });
		}
	}).login();
};
module.exports = KueriMe;