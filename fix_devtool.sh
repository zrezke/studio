extension="/home/filipjeretina/.config/Foxglove\ Studio\ Dev/extensions/fmkadmapgofadopljbjfkapdkoienihi"
manifest="$extension/manifest.json"
echo $manifest

# if ! [ -f "$manifest" ]; then
#   echo manifest doesn\'t exist, cannot patch
#   exit 0
# fi

md5=`md5sum "$manifest" | awk '{split($0,a," "); print a[1]}'`
if [ "$md5" = "e821851e1ba9ff96244025afa8178b06" ]; then
  echo manifest is already correct
  exit 0
fi

echo fixing extension
curl https://polypane.app/fmkadmapgofadopljbjfkapdkoienihi.zip --output extensions-fix.zip
rm -r "$extension"
mkdir "$extension"
unzip extensions-fix.zip -d "$extension"
rm extensions-fix.zip
