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

'读取模板路径^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Set Rs=Server.CreateObject("ADODB.Recordset")
Rs.Open ("select News_sort1 from benming_ch_worldec_Temp where selected=1"),conn,1,1
If Not Rs.Eof Then 
	templets=Rs("News_sort1")
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
		MaxPerPage=1
		Sql="Select * from benming_ch_NewsCat where root=4 order by ORderID"
		Set RsNewsCat=Server.CreateObject("ADODB.RecordSet")
		RsNewsCat.open Sql,Conn,1,1
		RsNewsCat.pagesize=MaxPerPage
		RsNewsCat.absolutepage=currentpage 
		Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&RsNewsCat.pagecount&"</b></font>个 <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
	
		tempi=1
		if RsNewsCat.eof=False and RsNewsCat.bof=False then
			for tempi=1 to RsNewsCat.pagesize
				Catid=RsNewsCat("id")
				HOPE_CatID=Catid
				HOPE_TITLE=RsNewsCat("CatName")
				
				'^^^^^^^^^^^^^^^^^^^开始分页
					
				msg_per_page=6 '一页12条记录
				mpage2=0
				SqlNews="Select * from benming_ch_news where Typeid="&RsNewsCat("id")
				Set RsNewsCount=Server.CreateObject("ADODB.RecordSet")
				RsNewsCount.open SqlNews,Conn,1,1
				If not RsNewsCount.Eof Then
					totalrec=RsNewsCount.RecordCount    '总记录条数
					RsNewsCount.Pagesize=msg_per_page   '每页数
					mpage2=RsNewsCount.Pagecount        '总页数
					rowcount=msg_per_page
				End If
				pageName=Catid
			
				if mpage2>=1 then
					for tempii=1 to mpage2
						if tempii=1 then
							tempsum=1
						else
							tempsum=(tempii-1)*msg_per_page+1
							pageName=Catid&"-"&tempii
						end if
							
						Hope_body=""
						SqlNewsCount2="SELECT TOP "&msg_per_page&" * FROM benming_ch_news WHERE Typeid="&Catid&" and (newsid <= (SELECT min(newsid) FROM (SELECT TOP "&tempsum&" newsid FROM benming_ch_news where Typeid="&Catid&" ORDER BY newsid desc) AS T)) ORDER BY newsid desc"
					
						Set RsNewsCount2=Server.CreateObject("ADODB.RecordSet")
						RsNewsCount2.open SqlNewsCount2,Conn,1,1
						do while not RsNewsCount2.eof
							Hope_body=Hope_body&"<table width=""100%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
            				Hope_body=Hope_body&"<tr>"
              				Hope_body=Hope_body&"<td width=""19"" height=""20"" align=""center"" valign=""middle"" class=""news_bottom_line"">&nbsp;<img src=""../../Skin/blue/Images/triangle.jpg"" width=""3"" height=""5"" /></td>"
							
              				Hope_body=Hope_body&"<td width=""726"" valign=""middle"" class=""news_bottom_line Font-Weight""><a href=""detail/"&RsNewsCount2("newsid")&".html"" class=""Font_2e4690_a "">"&RsNewsCount2("Title")&"</a> | "&FormatDate(RsNewsCount2("Dateandtime"),5)&"  </td>"
            				Hope_body=Hope_body&"</tr>"
            				Hope_body=Hope_body&"<tr>"
              				Hope_body=Hope_body&"<td height=""50"" colspan=""2"" valign=""middle"" class=""news_bottom_line news_sp Font_000000_a"" >"&gotTopic(RsNewsCount2("desc"),230)&"</td>"
            				Hope_body=Hope_body&"</tr>"
          					Hope_body=Hope_body&"</table>"
                     		RsNewsCount2.movenext
						loop 	
						RsNewsCount2.close
						Set RsNewsCount2=nothing
						'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^分页条
						Hope_body=Hope_body&"<table width=""90%"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
              			Hope_body=Hope_body&"<tr>"
                		Hope_body=Hope_body&"<td height=""45"" align=""center"">共 <strong>"&totalrec&"</strong> 条信息 "
						Hope_body=Hope_body&"<a href="""&Catid&"-1.html "" class=""0a"">首页</a>"
						
					
						if tempii-1<1 then
							Hope_body=Hope_body&" <span class=""0a"">上一页</span>"
						else
							Hope_body=Hope_body&" <a href="""&Catid&"-"&(tempii-1)&".html "" class=""0a"">上一页</a>"
						end if
						if tempii+1>mpage2 then
							Hope_body=Hope_body&" <span class=""0a"">下一页</span>"
						else
							Hope_body=Hope_body&" <a href="""&Catid&"-"&(tempii+1)&".html "" class=""0a"">下一页</a>"
						end if
						Hope_body=Hope_body&" <a href="""&Catid&"-"&mpage2&".html "" class=""0a"">尾页</a> "
						Hope_body=Hope_body&"页次：<strong> "&tempii&"/"&mpage2&" </strong>页 <strong>"&msg_per_page&"</strong>条信息/页</td>"
              			Hope_body=Hope_body&"</tr>"
          				Hope_body=Hope_body&"</table>"
							
						'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^分页条end
						pencat=Web_str
						pencat=Hope_HtmlResult(pencat)
						
						
						'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
						if currentPage=1 and tempii=1 then
							Set sort_save = fso.CreateTextFile(server.mappath("/News/index.html"))
							sort_save.Write pencat
							sort_save.Close
						end if
						
						if tempii=1 then
							Set sort_save = fso.CreateTextFile(server.mappath("/News/"&pageName&"-1.html"))
							sort_save.Write pencat
							sort_save.Close
						end if
						
						Set sort_save = fso.CreateTextFile(server.mappath("/News/"&pageName&".html"))
						sort_save.Write pencat
						sort_save.Close
					
							
					next
					'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^end分页结束
				else
					Hope_body=""
									
					'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				
					pencat=Hope_HtmlResult(Web_str)
					'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
						
					if currentPage=1 then
						Set sort_save = fso.CreateTextFile(server.mappath("/News/index.html"))
						sort_save.Write pencat
						sort_save.Close
					end if
					Set sort_save = fso.CreateTextFile(server.mappath("/News/"&pageName&".html"))
					sort_save.Write pencat
					sort_save.Close
					
				end if
				
					RsNewsCat.close
					Set RsNewsCat=nothing
					Conn.close
					Set Conn=nothing
					Response.write "<meta http-equiv=Refresh content='0; URL=maketrade.asp?page="&currentPage+1&"'>"
				next
			
		end if
       '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	   
  
		
%>