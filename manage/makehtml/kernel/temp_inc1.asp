<!--#include file="config.asp"-->
<%

'************************************  start  **************************************************

'作用：标签函数通用匹配替换，自动识别标签函数名称和参数及信息变量名称，自动调用函数执行和变量值

    '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
     Function Hope_HtmlResult(str)
		resultHtml=Hope_htmlAll(str)
	   	resultHtml=Hope_htmlAll(resultHtml)  '使用三层，考虑资源问题
		Hope_HtmlResult=resultHtml
	 End Function
    '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	Function  Hope_htmlAll(str)
 		str=Hope_htmlAllCus(str)               '替换自定义标签内容 
 		strInfo=RegExpTest("#\w+(\((\b[,0-9]+\b)?\))?#", str) '调用函数(RegExpTest)匹配出所有str变量中的标签
 		If strInfo<>"" Then
				arrInfo=Split(strInfo,"|")
 				For i=0 To ubound(arrInfo)-1
  				If Left(arrInfo(i),3)="#BM" Then 
				   '处理自定义标签^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
				   cusLabelcon=ReplceCusLabel(arrInfo(i))               '提出标签名称进行赋值
				   str=Replace(str,arrInfo(i),cusLabelcon)              '替换自定义标签内容 
 				   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
 				Else
  				  If InStr(arrInfo(i),"(")>0 Then 
				  '替换函数标签^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
					   funTitle=tempTitle(arrInfo(i))    '调用函数(temptitle)取函数名称
 					   arry=tempInfo(arrInfo(i))         '调用函数(tempinfo)取参数列表
						
 					     On Error Resume Next
 					   str=Replace(str,arrInfo(i),Eval(funTitle&"("&arry&")"))'取函数返回值
					  
				   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   
				  Else
   					   '替换静态标签和无参函数标签^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
					   staTitle=staticTitle(arrInfo(i))  '调用函数(statictitle)取变量名称
 					     On Error Resume Next
 					   str=Replace(str,arrInfo(i),Eval(staTitle)) '取变量值 
					   
  				  End If
   				   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
			   End If
 			   Next
 		  End If
 		 Hope_htmlAll=str	
	End Function
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
	
	'处理自定义标签^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
  	Function  Hope_htmlAllCus(str)
 		strInfo=RegExpTest("#BM_\w+#", str) '调用函数(RegExpTest)匹配出所有str变量中的标签
 		If strInfo<>"" Then
				arrInfo=Split(strInfo,"|")
 				For i=0 To ubound(arrInfo)-1
				   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 				   cusLabelcon=ReplceCusLabel(arrInfo(i))               '提出标签名称进行赋值
				   str=Replace(str,arrInfo(i),cusLabelcon)              '替换自定义标签内容 
 				   '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
 				Next
 	    End If
 	   Hope_htmlAllCus=str	
	End Function
     '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


 	'查出该自定义标签的内容^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	Function ReplceCusLabel(str)
	 strs=""
	 nostr=str
	 Set rscul=server.CreateObject("ADODB.Recordset")
     sqlcul="select top 1 lcontent from benming_ch_cuslabel where lname='"&str&"'"
	
     rscul.Open sqlcul,conn,1,1
	 If rscul.Eof Then 
	 strs=nostr
	 End If
     If Not rscul.Eof Then
     strs=rscul("lcontent")
     rscul.close
     End If
     ReplceCusLabel=strs
 	End Function
	
	
    '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 	'获取变量名称
	Function staticTitle(str)
		  no=Len(str)-2
		  staticTitle=Mid(str,2,no)
	End Function
	
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	 '获取标签中的函数名称
	Function tempTitle(str)
		 nstart=Instr(str,"(")
		 tempTitle=mid(str,2,nstart-2)
		 
	End Function
   	
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
	'检测标签函数或信息变量的重复,多个性
	Function RegExpTest(patrn, strng)
	   Dim regEx, Match, Matches   ' 建立变量。
	   Set regEx = New RegExp   ' 建立正则表达式。
 	   regEx.Pattern = patrn   ' 设置模式。
	   regEx.IgnoreCase = False   ' 设置是否区分字符大小写。
	   regEx.Global = True   ' 设置全局可用性。
	   Set Matches = regEx.Execute(strng)   ' 执行搜索。
	   For Each Match In Matches   ' 遍历匹配集合。
	   On Error Resume Next
 		  RetStr = RetStr & Match.Value&"|"
	   Next
	   RegExpTest = RetStr
	End Function
	
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
	'获取标签中的函数中的参数列表
	Function tempInfo(str)   '#HOPE_newinfo(1,10,5,100)#  '1,10,5,100
		nstart=Instr(str,"(")
		nend=Instr(str,")")	
		tempInfo=Mid(str,nstart+1,nend-nstart-1)
		
	End Function
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
	
	Function noHtml(str)
		Dim re
		Set re=New RegExp
		re.IgnoreCase =True
		re.Global=True
		re.Pattern="(\<.*?\>)"
		str=re.Replace(str,"")
		re.Pattern="(\<\/.*?\>)"
		str=re.Replace(str,"")
		noHtml=str
	End Function

	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^end^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 
	
	
	
	
	'以下是标签函数和信息变量：
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	'信息变量---------网站公用配置信息：
	
	 HOPE_Webname=WebName     '网站名称         #HOPE_Webname#
	 HOPE_WebUrl=WebUrl       '网站地址         #HOPE_WebUrl#
	 
	 HOPE_coname=coname       '公司名称         #HOPE_coname#
	 HOPE_address=coadd     '公司联系地址     #HOPE_address#
	 HOPE_post=post           '网站联系邮政编码 #HOPE_post#
	 
	 HOPE_tel=Systemtel       '网站联系电话     #HOPE_tel#
	 HOPE_fax=hotfax          '网站联系传真     #HOPE_fax#
	 HOPE_Ren=Ren              '联系人           #HOPE_Ren#
	  
	 HOPE_Email=SystemEmail   '网站联系邮箱     #HOPE_Email#  
	  
	 HOPE_WebIcp=icp          '网站备案         #HOPE_WebIcp#      
	
	 
	 HOPE_WebQQ=WebQQ         '联系QQ           #HOPE_WebQQ#
	 HOPE_WebMsn=WebMsn       '联系msn          #HOPE_WebMsn#
	 
	 HOPE_Webauthor=Webauthor '网站作者        #HOPE_Webauthor#
	 HOPE_Copyright=WebCopyright '网站版权标      #HOPE_Copyright#
	 
	 HOPE_benming=benming '#HOPE_benming#
	   
	
	
 	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
	'网站标题信息的信息设置 #HOPE_Meta_Title(typeid)#
	'typeid---是栏目号
	Function HOPE_Meta_Title(typeid)
		strs=""
 		sqlm="select Title from benming_ch_MetaType where id="&typeid
		
		Set rsm=Server.CreateObject("ADODB.Recordset")
		rsm.open sqlm,conn,1,1
		If Not rsm.Eof Then
			strs=rsm("Title")
		End If 
		rsm.close
		Set rsm=Nothing
	   	HOPE_Meta_Title=strs
	End Function
	
	'网站关键字  #HOPE_Meta_Keywords(typeid)#
	'是栏目号:1--首页,2--关于公司,3--新闻,4--产品首页,5--人才招聘,6--客户留言
	Function HOPE_Meta_Keywords(typeid)
		strs=""
		sqlm="select meta_keywords from benming_ch_MetaType where id="&typeid
		Set rsm=Server.CreateObject("ADODB.Recordset")
		rsm.open sqlm,conn,1,1
		If Not rsm.Eof Then
			strs=rsm("meta_keywords")
		End If
		rsm.close
		Set rsm=Nothing
	   HOPE_Meta_Keywords=strs
 	End Function

 	
  	'网站Meta信息的描述信息设置 #HOPE_Meta_Description(typeid)#
	'typeid---是栏目号
	Function HOPE_Meta_Description(typeid)
		strs=""
 		sqlm="select meta_descriptions from benming_ch_MetaType where id="&typeid
		Set rsm=Server.CreateObject("ADODB.Recordset")
		rsm.open sqlm,conn,1,1
		If Not rsm.Eof Then
			strs=rsm("meta_descriptions")
		End If 
		rsm.close
		Set rsm=Nothing
	   	HOPE_Meta_Description=strs
	 End Function
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^end^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
	
	
	
	
 	'^^^^^^^^^^^^^^^^^^^^^^^^以下是关于我们^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
	'关于我们分类	#HOPE_aboutCat(17)#
	'ID--关于我们id
	Function HOPE_aboutCat(ID)
		strs=""
		sql="Select * from benming_ch_Cocat where root="&id&" order by OrderID"
		Set Rs_CoCat=Server.CreateObject("ADODB.RecordSet")
		Rs_CoCat.open Sql,Conn,1,1
		strs="<table width=""80%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
		AboutI=0
		do while not Rs_CoCat.eof 
			AboutI=AboutI+1
			if Rs_CoCat("sitepath")=1 then
				StrUrl=Rs_CoCat("siteurl")
			else
				StrUrl="About-"&Rs_CoCat("id")&".html"
			end if
			strs=strs&"<tr>"
			
			if AboutI=Rs_CoCat.RecordCount then
				strs=strs&"<td width=""15%"" height=""25"" align=""center"" ><img src=""/Skin/blue/Images/Co_left_ico.gif"" width=""15"" height=""13"" /></td>"
        		strs=strs&"<td width=""85%"" >&nbsp;<a href="""&StrUrl&""" class=""Font_000000_a"">"&Rs_CoCat("coname")&"</a></td>"
			else
				strs=strs&"<td width=""15%"" height=""25"" align=""center"" class=""Corporation_line""><img src=""/Skin/blue/Images/Co_left_ico.gif"" width=""15"" height=""13"" /></td>"
				strs=strs&"<td width=""85%"" class=""Corporation_line"">&nbsp;<a href="""&StrUrl&""" class=""Font_000000_a"">"&Rs_CoCat("coname")&"</a></td>"
			end if
    		strs=strs&"</tr>"
			Rs_CoCat.movenext
		Loop
		Rs_CoCat.close
		Set RS_CoCat=nothing
		strs=strs&"</table>"
		HOPE_aboutCat=strs
	End Function
	
	
 	'^^^^^^^^^^^^^^^^^^^^^^^^以下是新闻中心^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	'新闻中心分类	#HOPE_NewsCat(4,"news")#
	'ID--新闻大类ID
	'Dir---1=新闻 2=服务
	Function HOPE_NewsCat(ID,Dir)
		Dim StrDir
		if Dir=1 then
			StrDir="news"
		elseif Dir=2 then
			StrDir="service"
		end if
		
		strs=""
		sql="Select * from benming_ch_NewsCat where root="&ID&" order by OrderID"
		Set Rs_NewsCat=Server.CreateObject("ADODB.RecordSet")
		Rs_NewsCat.open Sql,Conn,1,1
		strs="<table width=""80%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
		NewsI=0
		do while not Rs_NewsCat.eof 
			NewsI=NewsI+1
			strs=strs&"<tr>"
			if NewsI=Rs_NewsCat.RecordCount then
				strs=strs&"<td width=""15%"" height=""25"" align=""center"" ><img src=""/Skin/blue/Images/Co_left_ico.gif"" width=""15"" height=""13"" /></td>"
        		strs=strs&"<td width=""85%"" >&nbsp;<a href=""/"&StrDir&"/"&Rs_NewsCat("id")&".html"" class=""Font_000000_a"">"&Rs_NewsCat("CatName")&"</a></td>"
			else
				strs=strs&"<td width=""15%"" height=""25"" align=""center"" class=""Corporation_line""><img src=""/Skin/blue/Images/Co_left_ico.gif"" width=""15"" height=""13"" /></td>"
				strs=strs&"<td width=""85%"" class=""Corporation_line"">&nbsp;<a href=""/"&StrDir&"/"&Rs_NewsCat("id")&".html"" class=""Font_000000_a"">"&Rs_NewsCat("CatName")&"</a></td>"
			end if
			
    		strs=strs&"</tr>"
			Rs_NewsCat.movenext
		Loop
		Rs_NewsCat.close
		Set Rs_NewsCat=nothing
		strs=strs&"</table>"
		HOPE_NewsCat=strs
	End Function
	
	'^^^^^^^^^^^^^^^^^^^^^^^^以下是产品中心^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	'产品大类
	Function HOPE_ProductsCat()
		strs=""
		sql="Select * from benming_ch_ProdCat where root=0 order by OrderID"
		Set Rs_ProductsCat=Server.CreateObject("ADODB.RecordSet")
		Rs_ProductsCat.open Sql,Conn,1,1
		strs="<table width=""80%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
		NewsI=0
		do while not Rs_ProductsCat.eof 
			ProductsI=ProductsI+1
			strs=strs&"<tr>"
			if ProductsI=Rs_ProductsCat.RecordCount then
				strs=strs&"<td width=""15%"" height=""25"" align=""center"" ><img src=""/Skin/blue/Images/Co_left_ico.gif"" width=""15"" height=""13"" /></td>"
        		strs=strs&"<td width=""85%"" >&nbsp;<a href=""/products/"&Rs_ProductsCat("id")&".html"" class=""Font_000000_a"">"&Rs_ProductsCat("CatName")&"</a></td>"
			else
				strs=strs&"<td width=""15%"" height=""25"" align=""center"" class=""Corporation_line""><img src=""/Skin/blue/Images/Co_left_ico.gif"" width=""15"" height=""13"" /></td>"
				strs=strs&"<td width=""85%"" class=""Corporation_line"">&nbsp;<a href=""/products/"&Rs_ProductsCat("id")&".html"" class=""Font_000000_a"">"&Rs_ProductsCat("CatName")&"</a></td>"
			end if
			
    		strs=strs&"</tr>"
			Rs_ProductsCat.movenext
		Loop
		Rs_ProductsCat.close
		Set Rs_ProductsCat=nothing
		strs=strs&"</table>"
		HOPE_ProductsCat=strs
	End Function

'''''''''''''''''''''''''''''''''''''''''
'产品大类
	Function HOPE_ProductsCat2()
		strs=""
		sql="Select * from benming_ch_ProdCat where root=0 order by OrderID"
		Set Rs_ProductsCat=Server.CreateObject("ADODB.RecordSet")
		Rs_ProductsCat.open Sql,Conn,1,1
		strs="<table width=""100%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
		NewsI=0
					strs=strs&"<tr><td>"

		do while not Rs_ProductsCat.eof 
			ProductsI=ProductsI+1
			if ProductsI=Rs_ProductsCat.RecordCount then
				
        		strs=strs&"<a href=""/products/"&Rs_ProductsCat("id")&".html"" class=""Font_000000_a"">"&Rs_ProductsCat("CatName")&"</a> | "
			else
				strs=strs&"&nbsp;<a href=""/products/"&Rs_ProductsCat("id")&".html"" class=""Font_000000_a"">"&Rs_ProductsCat("CatName")&"</a> | "
			end if
			
			Rs_ProductsCat.movenext
		Loop
		Rs_ProductsCat.close
		Set Rs_ProductsCat=nothing
    		strs=strs&"</td></tr>"
		
		strs=strs&"</table>"
		HOPE_ProductsCat2=strs
	End Function
'''''''''''''''''''''''''''''''''''''''''
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^联系我们办事处^^^^^^^^^^^^^^^^^^^^^^^^^^^
	Function HOPE_Contact()
		Sql="Select * from benming_ch_Contact"
		Set Rs=Server.CreateObject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		
		strs=strs&"<table width=""95%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
		strs=strs&"<tr>"
		ContactI=0
		Do While not Rs.eof	
			ContactI=ContactI+1
			strs=strs&"<td width=""50%"">"
			strs=strs&"<DIV style=""PADDING-TOP:8px""></div>"
			strs=strs&"<table width=""100%"" border=""0"" cellpadding=""0"" cellspacing=""0"">"
			strs=strs&"<tr>"
			strs=strs&"<td height=""20"" colspan=""2"" class=""Font-Weight Font_2E4690_a Font_Offices"">&nbsp;"&Rs("offname")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"<tr>"
			strs=strs&"<td width=""14%"" height=""20"">&nbsp;地&nbsp;&nbsp;址：</td>"
			strs=strs&"<td width=""86%"">&nbsp;"&Rs("address")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"<tr>"
			strs=strs&"<td height=""20"">&nbsp;电&nbsp;&nbsp;话：</td>"
			strs=strs&"<td>&nbsp;"&Rs("phone")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"<tr>"
			strs=strs&"<td height=""20"">&nbsp;传&nbsp;&nbsp;真：</td>"
			strs=strs&"<td>&nbsp;"&Rs("fax")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"<tr>"
			strs=strs&"<td height=""20"">&nbsp;联系人：</td>"
			strs=strs&"<td>&nbsp;"&Rs("linkren")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"<tr>"
			strs=strs&"<td height=""20"">&nbsp;邮&nbsp;&nbsp;箱：</td>"
			strs=strs&"<td>&nbsp;"&Rs("Email")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"<tr>"
			strs=strs&"<td height=""20"">&nbsp;邮&nbsp;&nbsp;编：</td>"
			strs=strs&"<td>&nbsp;"&Rs("post")&"</td>"
			strs=strs&"</tr>"
			strs=strs&"</table>"
			strs=strs&"</td>"
			if ContactI mod 2=0 then
				strs=strs&"</tr><tr>"
			end if
			Rs.movenext
		loop
    	strs=strs&"</tr>"
		strs=strs&"</table>"
		HOPE_Contact=strs
	End Function
	
	
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^以下是网站首页^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
	'推荐产品
	Function prodIndex()
  Dim strs,strprodname,strremark,strsmallpic,id,strclass,rs
  
  Sql="Select top 12 * from benming_ch_prod where tjhome=1 and show=1 order by id desc"
  Set rs=Server.Createobject("ADODB.RecordSet")
  rs.open Sql,Conn,1,1
  strs=strs&"<table width=""545"" height=""130"" border=""0"" cellpadding=""0"" cellspacing=""0"">"
      strs=strs&"<tr>"

  for prodIndexI=1 to 12 
    strprodname=" "
    strremark=" "
    strsmallpic=" "
    id=""
    if prodIndexI=5 then
     strclass="class="""""
    else if prodindexi=12 then 
     strclass="class="""""
    else
     strclass="class="""""
    end if
    end if
    
    if  rs.eof=false and rs.bof=False then
     strprodname=rs("prodname")
     strremark=rs("remark")
     id=rs("id")
     smallpic=rs("smallpic")
     if isnull(smallpic) or Trim(smallpic)="" then
      smallpic="/skin/dfpic.gif"
     end if
    
     strsmallpic="<a href=""/products/detail/"&id&".html"" target=""_blank""><img src="""&rs("smallpic")&""" width=""120"" height=""120"" border=""0""  alt="&strprodname&"></a>"
                    Catid=rs("Catid")
     rs.movenext
    end if
           strs=strs&"<td width=""120"" valign=""top"" "&strclass&" style=""BORDER-BOTTOM: #cccccc 1px dashed;"">"
    strs=strs&"<table width=""120"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"" >"
    strs=strs&"<tr>"
    strs=strs&"<td align=""center"" class=""bottom_dashedl_line"" height=""60"">"
    strs=strs&strsmallpic
    strs=strs&"</td>"
    strs=strs&"</tr>"
    strs=strs&"<tr>"
    strs=strs&"<td class=""Index_pr""><DIV style=""PADDING-TOP:4px""></DIV>"
    strs=strs&"<span class=""title1"">"&strprodname&"</span> <br/>"   
    strs=strs&gotTopic(strremark,80)
    if id<>"" then
     strs=strs&""
     
    end if
    strs=strs&" </td>"
    strs=strs&"</tr>"
    strs=strs&"</table> "     
    strs=strs&"</td>"

'只要增加如下三行就OK了
             if prodIndexI mod 12 =0then '控制几条信息换行
     strs=strs&"</tr><tr>"
    end if



  next
  rs.close
  Set rs=nothing 
  strs=strs&"</tr>"
     strs=strs&"</table>"
  prodIndex=strs
End function
	
	'最新新闻
	Function newsIndex()
		strs=""
		Sql="Select top 10 * from benming_ch_news where Typeid in(6,17) order by newsid desc"
		Set Rs=Server.Createobject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		strs=strs&"<table width=""98%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"" class=""Right_dashed_line Right_dashedl_line"">"
		do while not Rs.eof
			
          	strs=strs&"<tr>"
            strs=strs&"<td width=""5%"" height=""25"" class=""bottom_dashedl_line"">"
			strs=strs&"<img src=""../../Skin/blue/Images/Right_ico.gif"" width=""13"" height=""13"" />"
			strs=strs&"</td>"
            strs=strs&"<td width=""95%"" class=""bottom_dashedl_line""><a href=""/news/detail/"&rs("newsid")&".html"" class=""Font_000000_B_a"">"&Rs("Title")&"</a></td>"
          	strs=strs&"</tr>"
'只要增加如下三行就OK了
             if prodIndexI mod 2 =0then '控制几条信息换行
     strs=strs&"</tr><tr>"
    end if
			Rs.movenext
		loop
		Rs.close
		Set Rs=nothing
		strs=strs&"</table>"
		newsIndex=strs
	End Function


	
	'最新服务
	Function serviceIndex()
		strs=""
		Sql="Select top 8 * from benming_ch_news where Typeid in(13,14) order by newsid desc"
		Set Rs=Server.Createobject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		strs=strs&"<table width=""98%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"" class=""Right_dashed_line Right_dashedl_line"">"
		do while not Rs.eof
			
          	strs=strs&"<tr>"
            strs=strs&"<td width=""5%"" height=""25"" class=""bottom_dashedl_line"">"
			strs=strs&"<img src=""../../Skin/blue/Images/Right_ico.gif"" width=""13"" height=""13"" />"
			strs=strs&"</td>"
            strs=strs&"<td width=""95%"" class=""bottom_dashedl_line""><a href=""/service/detail/"&rs("newsid")&".html"" class=""Font_000000_B_a"">"&Rs("Title")&"</a></td>"
          	strs=strs&"</tr>"
			
			Rs.movenext
		loop
		Rs.close
		Set Rs=nothing
		strs=strs&"</table>"
		serviceIndex=strs
	End Function
	

	
	'最新服务22
	Function serviceIndex2()
		strs=""
		Sql="Select top 8 * from benming_ch_news where Typeid in(32,38) order by newsid desc"
		Set Rs=Server.Createobject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		strs=strs&"<table width=""98%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"" class=""Right_dashed_line Right_dashedl_line"">"
		do while not Rs.eof
			
          	strs=strs&"<tr>"
            strs=strs&"<td width=""5%"" height=""25"" class=""bottom_dashedl_line"">"
			strs=strs&"<img src=""../../Skin/blue/Images/Right_ico.gif"" width=""13"" height=""13"" />"
			strs=strs&"</td>"
            strs=strs&"<td width=""95%"" class=""bottom_dashedl_line""><a href=""/service/detail/"&rs("newsid")&".html"" class=""Font_000000_B_a"">"&Rs("Title")&"</a></td>"
          	strs=strs&"</tr>"
			
			Rs.movenext
		loop
		Rs.close
		Set Rs=nothing
		strs=strs&"</table>"
		serviceIndex2=strs
	End Function


	'留言推荐产品
	Function msgIndex()
		Sql="Select top 3 * from benming_ch_prod where tjhome=1 and show=1"
		Set Rs=Server.Createobject("ADODB.RecordSet")
		Rs.open Sql,Conn,1,1
		strs=strs&"<table width=""160"" border=""0"" cellspacing=""0"">"
     	Do while not Rs.eof
        	strs=strs&"<tr>"
            strs=strs&"<td width=""160"" height=""100"" align=""center""><img src="""&rs("smallpic")&""" width=""150"" height=""94"" />"
			strs=strs&"</td>"
		
            strs=strs&"</tr>"
			strs=strs&"<tr>"
          	strs=strs&"<td><a href=""/products/detail/"&rs("id")&".html"" class=""Font_000000_a"">"&rs("prodName")&"</a></td>"
            strs=strs&"</tr>"
			rs.movenext
		Loop
		rs.close
		Set rs=nothing
		strs=strs&"</table>"
		msgIndex=strs
	End Function
	
%>