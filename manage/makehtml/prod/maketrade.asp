<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
 <!--#include file="../../../inc/filesystem.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<!--#include file="../kernel/temp_inc.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../admin/login.asp';</SCRIPT>" 
	response.end
end if
 

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 if trim(ins)="010" then 
 ishavegant=true
 end if
 next 
 if ishavegant=false then
 response.redirect "../../../admin/err.asp"
 response.end
 end if


'读取模板^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Set Rs=Server.CreateObject("ADODB.Recordset")
Rs.Open ("select produts_sort1 from benming_ch_worldec_Temp where selected=1"),conn,1,1
If Not Rs.Eof Then 
	templets=Rs("produts_sort1")
	Rs.Close
	Set Rs=nothing
End If
	
'取模板内容
Set fso =YXFSO
Set sort_save=fso.OpenTextFile(Server.MapPath(templets))  
Web_str=sort_save.ReadAll  
sort_save.close 	
	
'读取要生成的信息^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
If Request("page")<>"" Then
	If Cint(Request("page"))<1 Then
		currentPage=1
	Else
		currentPage=Cint(Request("page"))
	End If
Else        
	currentPage=1        
End If

	  
		'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^开始生成html页面
		Hope_body=""
		MaxPerPage=1
		Sql="Select * from benming_ch_ProdCat where root=0 order by ORderID asc"
		Set RsProdCat=Server.CreateObject("ADODB.RecordSet")
		RsProdCat.open Sql,Conn,1,1
		if RsProdCat.eof=False and RsProdCat.bof=false then
			RsProdCat.pagesize=MaxPerPage
			RsProdCat.absolutepage=currentpage 
		else
			pencat=Web_str
			pencat=Hope_HtmlResult(pencat)
			Set sort_save = fso.CreateTextFile(server.mappath("/valve/index.html"))
			sort_save.Write pencat
			sort_save.Close
			response.Write "没有分类 <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
			response.end
		end if
		Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&RsProdCat.pagecount&"</b></font>个 <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
		if currentPage>RsProdCat.pagecount then
			response.End()
		end if
		
		if RsProdCat.eof=False and RsProdCat.bof=False then
			msg_per_page=12 '一页12条记录+
			
			Catid=RsProdCat("id")
			
			strCatid=Getid(Catid)
			Hope_ProductsSmallCat=ProductsSmallCat(Catid)
			Hope_CatName=RsProdCat("CatName")
HOPE_prodKeywords=RsProdCat("key") '关键字
			Sqlprod="Select * from benming_ch_prod where show=1 and CatId in("&strCatid&")"
			Set RsPordCount=Server.CreateObject("ADODB.RecordSet")
			RsPordCount.open Sqlprod,Conn,1,1
			totalrec=RsPordCount.RecordCount    '总记录条数
			RsPordCount.Pagesize=msg_per_page   '每页数
			mpage2=RsPordCount.Pagecount        '总页数
			
			PageName=Catid
			Hope_body=""
			IF not RsPordCount.Eof Then
				For Tempi=1 to mpage2
					if Tempi=1 then
						tempsum=1
					else
						tempsum=(Tempi-1)*msg_per_page	+1
						PageName=Catid&"-"&Tempi
					end if
					
					Sqlprod2="SELECT TOP "&msg_per_page&" * FROM benming_ch_prod WHERE show=1 and Catid in("&strCatid&") and (orderid >= (SELECT max(orderid) FROM (SELECT TOP "&tempsum&" orderid FROM benming_ch_prod where show=1 and Catid in("&strCatid&") ORDER BY orderid ) AS T)) ORDER BY orderid "
					
					Set RsPordCount2=Server.CreateObject("ADODB.RecordSet")
					RsPordCount2.open Sqlprod2,Conn,1,1
					
					Hope_body="<table width=""98%"" border=""0"" cellpadding=""0"" cellspacing=""0"" align=""center"">"
            		Hope_body=Hope_body&"<tr>"
					do while not RsPordCount2.eof
						PordCountI=PordCountI+1
              			Hope_body=Hope_body&"<td width=""50%"" valign=""top"" class=""in6"" height=""100"">"
						
						Hope_body=Hope_body&"<table width=""100%"" height=""100"" border=""0"" cellpadding=""0"" cellspacing=""0"">"
                		Hope_body=Hope_body&"<tr>"
                  		Hope_body=Hope_body&"<td width=""39%"" rowspan=""2""><img src="""&RsPordCount2("smallpic")&"""alt="""&RsPordCount2("prodName")&"""width=""180"" height=""138"" /></td>"
                  		Hope_body=Hope_body&"<td width=""61%"" height=""20""><a href=""/Product/"&RsPordCount2("id")&".html""class=""Font_2E4690_a in4"">"&RsPordCount2("prodName")&"</a></td>"
                		Hope_body=Hope_body&"</tr>"
                		Hope_body=Hope_body&"<tr>"
                  		Hope_body=Hope_body&"<td valign=""top"">"&gotTopic(RsPordCount2("remark"),90)&"</td>"
                		Hope_body=Hope_body&"</tr>"
              			Hope_body=Hope_body&"</table>"
						Hope_body=Hope_body&"</td>"
              			if PordCountI mod 2 =0 then
							Hope_body=Hope_body&"</tr><tr>"
						end if
						if RsPordCount2.RecordCount=1 then
							Hope_body=Hope_body&"<td width=""50%"" valign=""top"" class=""in5"" height=""100"">&nbsp;</td>"
						end if
           				RsPordCount2.movenext
					loop
					RsPordCount2.close
					set RsPordCount2=nothing
					Hope_body=Hope_body&"</tr>"
					Hope_body=Hope_body&"</table>"
					
					Hope_body=Hope_body&"<table width=""90%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
            		Hope_body=Hope_body&"<tr>"
              		Hope_body=Hope_body&"<td height=""45"" align=""center"">共 <strong>1</strong> 条信息"
					Hope_body=Hope_body&" <a href="""&Catid&".html"" class=""0a"">首页</a>"
					if Tempi-1<1 then
						Hope_body=Hope_body&" <span>上一页</a>"
					else
						Hope_body=Hope_body&" <a href="""&Catid&"-"&(Tempi-1)&".html"">上一页</a>"
					end if
					if Tempi+1>mpage2 then
						Hope_body=Hope_body&" <span>下一页</a>"
					else
						Hope_body=Hope_body&" <a href="""&Catid&"-"&(Tempi+1)&".html"">下一页</a>"
					end if
					
					Hope_body=Hope_body&" <a href="""&Catid&"-"&mpage2&".html"">尾页</a>"
					Hope_body=Hope_body&" 页次：<strong> "&Tempi&"/"&mpage2&" </strong>页 <strong>"&msg_per_page&"</strong>条信息/页</td>"
           		 	Hope_body=Hope_body&"</tr>"
          			Hope_body=Hope_body&"</table>"
					
					'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
					pencat=Web_str
					pencat=Hope_HtmlResult(pencat)
					if currentPage=1 and Tempi=1 then
						Set sort_save = fso.CreateTextFile(server.mappath("/valve/index.html"))
						sort_save.Write pencat
						sort_save.Close
					end if
					if Tempi=1 then
						Set sort_save = fso.CreateTextFile(server.mappath("/valve/"&PageName&"-1.html"))
						sort_save.Write pencat
						sort_save.Close
					end if
					Set sort_save = fso.CreateTextFile(server.mappath("/valve/"&PageName&".html"))
					sort_save.Write pencat
					sort_save.Close
				Next
				
				
			Else
				'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
					pencat=Web_str
					pencat=Hope_HtmlResult(pencat)
					if currentPage=1 then
						Set sort_save = fso.CreateTextFile(server.mappath("/valve/index.html"))
						sort_save.Write pencat
						sort_save.Close
					end if
					
					Set sort_save = fso.CreateTextFile(server.mappath("/valve/"&PageName&".html"))
					sort_save.Write pencat
					sort_save.Close
			
			End IF
			'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			Response.write "<meta http-equiv=Refresh content='0; URL=maketrade.asp?page="&currentPage+1&"'>"
		end if
		
		RsProdCat.close
		Set RsProdCat=nothing
       '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^	
	   
'^^^^^^^大类下所有小类ID
Function Getid(id) 
	strid=id
 	Sqlid="Select * from benming_ch_ProdCat where Root="&id
	Set Rsid=Server.CreateObject("ADODB.RecordSet")
	Rsid.open Sqlid,Conn,1,1
	do while not Rsid.eof
		strid=strid&","&Rsid("id")
		Rsid.movenext
	loop
	Rsid.close
	Set Rsid=nothing
	Getid=strid
End Function


'产品小类
Function ProductsSmallCat(Root)
	Dim strs,ProductsSmallCatI,pps1,pps2
	strs=""	
	ProductsSmallCatI=0
        pps1=1
        pps2=0
	Sql="Select * from benming_ch_ProdCat where root="&Root&" order by OrderID"
	
	Set Rs_ProductsSmallCat=Server.Createobject("ADODB.RecordSet")
	Rs_ProductsSmallCat.open Sql,Conn,1,1
	strs="<table width=""99%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
	
	Do while not Rs_ProductsSmallCat.eof
                if pps1=1 then 
                  strs=strs&"<tr width=708>"
                  pps1=0                  
                end if
                pps2=pps2+1
		ProductsSmallCatI=ProductsSmallCatI+1
			
'		if ProductsSmallCatI=Rs_ProductsSmallCat.RecordCount then
'			strs=strs&"<td width=""120""height=""23"">&nbsp;<A href=""/products/"&Rs_ProductsSmallCat("id")&".html"">"&Rs_ProductsSmallCat("CatName")&"</a></td>"
'		else
'			strs=strs&"<td width=""120"" height=""23"">&nbsp;<A href=""/products/"&Rs_ProductsSmallCat("id")&".html"">"&Rs_ProductsSmallCat("CatName")&"</a></td>"
'		end if
		if ProductsSmallCatI=Rs_ProductsSmallCat.RecordCount then
			strs=strs&"<td width=""120"" height=""23""><A href=""/products/"&Rs_ProductsSmallCat("id")&".html"">"&Rs_ProductsSmallCat("CatName")&"</a></td>"
		else
			strs=strs&"<td width=""120"" height=""23""><A href=""/products/"&Rs_ProductsSmallCat("id")&".html"">"&Rs_ProductsSmallCat("CatName")&"</a></td>"
		end if


        Rs_ProductsSmallCat.movenext
        if pps2 mod 5=0 then
            strs=strs&"</tr>"
            pps1=1
        end if
	Loop
	
    strs=strs&"</table>"
	Rs_ProductsSmallCat.close
	Set Rs_ProductsSmallCat=nothing
	ProductsSmallCat=strs
End Function

%>
