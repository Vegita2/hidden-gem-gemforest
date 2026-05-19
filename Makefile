
index.html: index.tmpl readme.htm
	sed -e '/__CONTENT__/{r readme.htm' -e 'd;}' $< > $@
	rm readme.htm

readme.htm: README.md
	markdown-it $< >$@
