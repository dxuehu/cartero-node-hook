var fs = require( 'fs' );
var path = require( 'path' );
var shasum = require( 'shasum' );
var _ = require( 'underscore' );

var kMetaDataFileName = 'metaData.json';
var kOldPackageMapName = 'package_map.json';

var kMetaDataFormatVersion = 3;

module.exports = CarteroNodeHook;

function CarteroNodeHook( outputDirPath, options ) {
	if( ! ( this instanceof CarteroNodeHook ) ) return new CarteroNodeHook( outputDirPath, options );

	if( outputDirPath === undefined )
		throw new Error( 'outputDirPath is required' );

	options = _.defaults( {}, options, {
		appRootDir : '/',
		outputDirUrl : '/',
		cache : true
	} );

	this.appRootDir = options.appRootDir;
	this.outputDirPath = path.resolve( path.dirname( require.main.filename ), outputDirPath );
	this.outputDirUrl = options.outputDirUrl;
	this.cache = options.cache;

	this.metaData = this.getMetaData();
	this.parcelAssetsCache = {};
}

CarteroNodeHook.prototype.getTagsForEntryPoint = function( entryPointPath, cb ) {
	var _this = this;

	this.getAssetsForEntryPoint( entryPointPath, function( err, assetUrls ) {
		if( err ) return cb( err );

		var scriptTags = assetUrls.script.map( function( assetPath ) {
			return '<script type="text/javascript" src="' + path.join( _this.outputDirUrl, assetPath ) + '"></script>';
		} ).join( '\n' );

		var styleTags = assetUrls.style.map( function( assetPath ) {
			return '<link rel="stylesheet" href="' + path.join( _this.outputDirUrl, assetPath ) + '"></link>';
		} ).join( '\n' );

		cb( null, scriptTags, styleTags );
	} );
};

CarteroNodeHook.prototype.getAssetsForEntryPoint = function( entryPointPath, cb ) {
	//TODO perhaps impl so entryPointPath can be dir OR path (that may end in an ext such as .js)?
	//if using packageMap instead of entryPoint (with option to be dir or entryPoint):
	//if (path.extname(entryPointPath)) entryPointPath = path.dirname(entryPointPath); //test for an extension
	//var parcelId = this.metaData.packageMap[ _this.getPackageMapKeyFromPath( entryPointPath ) ];
	var _this = this;

	if( ! _this.cache ) this.metaData = this.getMetaData();

	if( ! this.metaData ) {
		return cb( new Error( 'Cartero meta data file could not be read.' ) );
	}

	var parcelId = this.metaData.entryPointMap[ _this.getPackageMapKeyFromPath( entryPointPath ) ];
	if( ! parcelId ) return cb( new Error( 'Could not find assets for entry point with absolute path "' + entryPointPath + '"' ) );

	if( _this.cache && this.parcelAssetsCache[ parcelId ] )
		cb( null, this.parcelAssetsCache[ parcelId ] );
	else {
		fs.readFile( path.join( this.outputDirPath, parcelId, 'assets.json' ), function( err, contents ) {
			if( err ) return cb( err );

			var parcelAssets = JSON.parse( contents );

			if( _this.cache )
				_this.parcelAssetsCache[ parcelId ] = parcelAssets;

			cb( null, parcelAssets );
		} );
	}
};

CarteroNodeHook.prototype.getAssetUrl = function( assetSrcAbsPath ) {
	var _this = this;

	if( ! this.metaData ) {
		throw new Error( 'Cartero meta data file could not be read.' );
	}

	var assetPathRelativeToAppDir = path.relative( this.appRootDir, assetSrcAbsPath );

	if( ! this.metaData.assetMap[ assetPathRelativeToAppDir ] ) {
		throw new Error( 'Could not find url for asset "' +  assetSrcAbsPath + '" because no corresponding asset map entry was found.' );
	}

	var assetPathRelativeToOutputDir = this.metaData.assetMap[ assetPathRelativeToAppDir ];

	return _this.outputDirUrl ? path.join( _this.outputDirUrl, assetPathRelativeToOutputDir ) : assetPathRelativeToOutputDir;
};

CarteroNodeHook.prototype.getPackageMapKeyFromPath = function( packagePath ) {
	return path.relative( this.appRootDir, packagePath );
};

CarteroNodeHook.prototype.getMetaData = function() {
	var _this = this;
	var metaData;

	try {
		var data = fs.readFileSync( path.join( this.outputDirPath, kMetaDataFileName ), 'utf8' );
		metaData = JSON.parse( data );
	} catch( err ) {
		if( fs.existsSync( path.join( this.outputDirPath, kOldPackageMapName ) ) )
			throw new Error( 'Error while reading ' + kMetaDataFileName + ' file from ' + this.outputDirPath + '. It looks like your assets were compiled with an old version of cartero incompatible with this cartero hook.\n' + err );

		if( _this.cache ) {
			throw new Error( 'Error while reading ' + kMetaDataFileName + ' file from ' + this.outputDirPath + '. (Have you run cartero yet?)\n' + err );
		} else {
			console.log( 'WARNING: Error while reading ' + kMetaDataFileName + ' file from ' + this.outputDirPath + '. (Have you run cartero yet?)\n' + err );
		}
	}

	if( metaData && metaData.formatVersion < kMetaDataFormatVersion ) {
		throw new Error( 'It looks like your assets were compiled with an old version of cartero incompatible with this cartero hook. Please update your version of cartero to the most recent release.' );
	}

	return metaData;
};
