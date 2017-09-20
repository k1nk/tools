#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# usage: ./increase_picture.py hogehoge.jpg
#

import sys
import os
import io

def concat_file(src,dstf,ext):
    dstfilename = dstf+ext
    #df=open(dstfilename,'a',encoding="utf-8_sig")
    df=io.open(dstfilename,'a',encoding="utf-8")
    with io.open(src,'r',encoding="utf-8") as sf:
        for row in sf:
            #list2 = list+'\n'
            df.write(row)
    df.close()

def concat_if_file_with_ext(src,dstf,extensions):
    root, ext = os.path.splitext(src)
    for target_ext in extensions:
        if ext == "." + target_ext :
            print(src)
            concat_file(src,dstf,ext)

def transtree(src, dstf,extensions):
    names = os.listdir(src)
    #if not os.path.exists(dst):
    #    os.mkdir(dst)
    for name in names:
        srcname = os.path.join(src, name)
        #dstname = os.path.join(dst, name)
        try:
            if os.path.isdir(srcname):
                transtree(srcname, dstf,extensions)
            else:
                concat_if_file_with_ext(srcname, dstf,extensions)
        except (IOError, os.error) as why:
            print ("Can't translate %s to %s: %s" % (srcname, dstname, str(why)))

if __name__ == '__main__':
    source_dir = sys.argv[1]
    dest_filename = "all"
    extensions = ["js","html","css","md","json"]
    transtree(source_dir,dest_filename,extensions)
